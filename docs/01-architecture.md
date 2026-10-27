# 01 — System Architecture

## Stack

### Frontend (`airightpath-fe`)

| Concern | Choice |
| --- | --- |
| Framework | React 18.3 + TypeScript 5.5 |
| Build | Vite 5 |
| Routing | react-router-dom 7 |
| Styling | Tailwind CSS 3.4 + CSS custom properties (theme tokens) |
| HTTP | axios 1.13 (single instance, interceptors) |
| Server state | @tanstack/react-query 5 (used selectively; most screens call services directly) |
| Forms | react-hook-form 7 + zod 4 via @hookform/resolvers |
| Realtime | @stomp/stompjs 7 over sockjs-client 1.6 |
| Code editor | @monaco-editor/react |
| Face detection | face-api.js (models served from `public/`) |
| Exports | exceljs (results workbook), jspdf (answer sheets) |
| Icons | lucide-react |

### Backend (`airightpath-be`)

| Concern | Choice |
| --- | --- |
| Framework | Spring Boot 3.4.0, Java 21 |
| Web | spring-boot-starter-web + webflux (`WebClient` for OpenAI) |
| Persistence | Spring Data JPA + Hibernate to MySQL 8 |
| Security | Spring Security + jjwt 0.11.5 |
| Realtime | spring-boot-starter-websocket (STOMP broker + raw handler) |
| Templating | Thymeleaf (email templates) |
| API docs | springdoc-openapi 2.7 (`/swagger-ui.html`) |
| File parsing | Apache Tika 2.9 (resume text extraction) |
| Object storage | AWS SDK v2 `s3`; AWS `rekognition` also on the classpath |
| Messaging | Twilio 11 (WhatsApp), Spring Mail (SMTP) |
| Misc | Lombok, commons-text, okhttp + okhttp-sse (OpenAI streaming) |

## Runtime topology

```
                     +------------------------------+
                     |  Browser (candidate/admin)   |
                     |  React SPA served by nginx   |
                     +------+----------------+------+
                  HTTPS/JSON |                | SockJS + STOMP
                             |                | (audio chunks as base64 frames)
                     +-------v----------------v-----+
                     |   Spring Boot API (:8081)    |
                     |                              |
                     |  Controllers -> Services ->  |
                     |  Repositories                |
                     |                              |
                     |  + CodeExecutionEngine       |
                     |    spawns javac/java,        |
                     |    python3, node, gcc, g++   |
                     +--+---------+---------+-------+
                        |         |         |
              +---------v--+ +----v----+ +--v-------------+
              |  MySQL 8   | | AWS S3  | |  OpenAI API    |
              |  (RDS)     | | media   | |  gpt-4o        |
              +------------+ +---------+ |  whisper-1     |
                        |                |  tts-1-hd      |
              +---------v--+             +----------------+
              | SMTP mail  |
              | + Twilio   |
              +------------+
```

The exam and interview toolchains run **inside the API container**, not in a
separate sandbox service. The backend `Dockerfile` therefore installs the
language runtimes and verifies each one at build time, so a missing toolchain
fails the image build rather than a candidate's submission mid-exam.

## How the two apps talk

### REST

- The client keeps every path in one file —
  [`src/config/api.endpoints.ts`](../src/config/api.endpoints.ts). Nothing else
  in the app writes a URL string, so a backend path change is a single edit.
- One axios instance in [`src/services/api.service.ts`](../src/services/api.service.ts)
  carries `withCredentials: true` (for the refresh cookie), a request interceptor
  that attaches `Authorization: Bearer <access token>`, and a response
  interceptor that performs a single-flight token refresh on 401.
- Service modules under [`src/services/`](../src/services/) wrap the endpoints
  per domain; pages never call axios directly.

### WebSocket

Two channels, both registered in `config/WebSocketConfig.java`:

| Endpoint | Protocol | Used by |
| --- | --- | --- |
| `/ws` | SockJS + STOMP | Voice interview (audio in, transcript and TTS out), mobile pairing for room scan |
| `/ws/terminal` | Raw `WebSocketHandler` | `TerminalSocketHandler` |

STOMP configuration: simple broker on `/queue` and `/topic`, application
destination prefix `/app`, user prefix `/user`. Handshake auth is done by
`WebSocketAuthInterceptor`, which stores the authenticated email in session
attributes; every `@MessageMapping` then re-checks that the schedule being
addressed belongs to that email before acting.

Full destination list: [06-api-reference.md](06-api-reference.md).

### CORS

`CorsConfig` reads `app.cors.allowed-origins` from the active profile, allows
credentials, and permits `GET, POST, PATCH, PUT, DELETE, OPTIONS`. The same
origin list is passed to the STOMP endpoint registration, so a browser that can
call the API can also open the socket.

## Request path through the backend

```
HTTP request
   |
   +- RequestResponseLoggingFilter   assigns a correlation id -> MDC "requestId"
   |                                 (every log line renders as LEVEL [id] ...)
   +- CORS filter
   +- ApiJwtAuthenticationFilter     validates the access token, builds the
   |                                 Authentication with permission authorities
   +- SecurityFilterChain            /api/** stateless; small public allowlist
   |
   +- @PreAuthorize("hasAuthority('...')")   method-level permission check
   |
   +- Controller -> Service (interface) -> ServiceImpl -> Repository -> MySQL
```

`ThreadLocalUserContext` / `RightpathThreadLocal` carry the caller's identity to
service code that needs it without threading it through every signature.

## Repository layout

```
AI-Rightpath/
├── Frontend/airightpath-fe/
│   ├── src/                    application code (see 03-frontend-architecture.md)
│   ├── public/                 static assets incl. face-api models
│   ├── docs/                   this documentation
│   ├── Dockerfile              multi-stage: node build -> nginx
│   ├── nginx.conf              SPA fallback to index.html
│   ├── vite.config.ts          @ alias, dev proxy to :8081, host 0.0.0.0
│   └── .env.{development,staging,production}
│
└── Backend/airightpath-be/
    ├── src/main/java/com/rightpath/
    │   ├── config/             security, CORS, websocket, async, OpenAPI, RBAC seed
    │   ├── controller/         20 REST/STOMP controllers
    │   ├── dto/                request/response types incl. dto/voice
    │   ├── entity/             26 JPA entities
    │   ├── enums/              17 domain enums
    │   ├── error/ exceptions/  error envelope + handlers
    │   ├── filter/             JWT filter, request logging
    │   ├── rbac/               RoleName, PermissionName
    │   ├── repository/         Spring Data repositories + specifications
    │   ├── service/            interfaces
    │   ├── service/impl/       implementations
    │   ├── util/               PDF, prompts, tokens, schedule helpers
    │   ├── validator/          password rules
    │   └── websocket/          STOMP auth interceptor, socket handlers
    ├── src/main/resources/
    │   ├── application.properties        base config + mail branding
    │   ├── application-{dev,stage,uat,prod}.yml
    │   ├── interview-prompts.properties  interview prompt text
    │   ├── synonyms.json                 ATS skill synonyms
    │   └── templates/                    Thymeleaf email templates
    ├── docs/                   adr/, migrations/, rbac.md, agent-changes.md
    ├── Dockerfile              JDK 21 + python3 + node + build-essential
    └── docker-compose.yml      app + MySQL 8 for local use
```

## Cross-cutting design decisions

**Access token in `localStorage`, refresh token in an httpOnly cookie.** The
server rotates the refresh token on every use and treats reuse of a rotated
token as theft, revoking the whole session. A memory-only access token meant
every page load spent a rotation, and two reloads in quick succession logged the
user out. Persisting the short-lived access token removes the cause; the refresh
cookie is only spent once the access token has genuinely expired. Trade-off and
detail: [08-security-rbac.md](08-security-rbac.md).

**Single-flight refresh, locked across tabs.** One in-flight refresh promise per
tab, plus an origin-wide Web Locks lock so two tabs cannot both spend the cookie.

**Exam length is derived, not a stored constant.** Duration = question count x
per-question allowance, with an admin override carried on the assessment row.
See [`src/utils/exam-duration.utils.ts`](../src/utils/exam-duration.utils.ts).

**Client timeouts sit above server limits.** `COMPILE_TIMEOUT_MS` is 120 s
because the server bounds execution at 45 s and queues up to 4 parallel
submissions; a client that aborted first would replace a typed server error with
a generic "try again".

**Compile once, run many.** `CodeExecutionEngine` compiles a submission a single
time and reuses the artifact across every test case, with a deadline per process
and a budget for the whole submission.

**Grading is percentage-based.** The exam page computes the percentage and sends
it alongside raw score and total marks; the paper's `passPercentage` is compared
against the percentage, not against raw marks.

**Assign and notify succeed independently.** Creating an assessment and emailing
the candidate are separate outcomes — `assignAssessment` returns a report naming
anyone who got the exam but not the mail, so a recruiter can resend rather than
find out when the candidate never turns up.
