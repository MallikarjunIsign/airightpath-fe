# AIRightpath — Technical Reference

**Complete frontend and backend documentation, in one file.**

| | |
| --- | --- |
| Revision | 2026-08-29 |
| Branch | `staging` |
| Frontend | `airightpath-fe` — React 18.3 · TypeScript 5.5 · Vite 5 |
| Backend | `airightpath-be` — Spring Boot 3.4.0 · Java 21 |
| Database | MySQL 8 |
| AI models | `gpt-4o` · `whisper-1` · `tts-1-hd` |
| L1 status | Complete end to end |
| L2 status | Complete end to end |

An AI hiring platform that screens resumes, runs proctored aptitude and coding
exams, and conducts the first-round interview with a voice agent. This document
covers both repositories, organised around the split the product itself is built
on: **L1** is everything up to the exam result, **L2** is everything from the
interview onward.

> **Companion formats.** This file is the source of truth in the repo. The same
> content is published as a designed, navigable page at
> [`airightpath-technical-reference.html`](airightpath-technical-reference.html).
> The modular per-topic set (`00-overview.md` … `10-project-status.md`) remains
> for granular editing — see [README.md](README.md). Change one, change the
> others.

---

## Contents

| # | Section |
| --- | --- |
| 01 | [Platform Overview](#01--platform-overview) |
| 02 | [System Architecture](#02--system-architecture) |
| 03 | [Backend](#03--backend) |
| 04 | [Frontend](#04--frontend) |
| 05 | [L1 — Assessment Flow](#05--l1--assessment-flow) |
| 06 | [L2 — Interview Flow](#06--l2--interview-flow) |
| 07 | [API Reference](#07--api-reference) |
| 08 | [Data Model](#08--data-model) |
| 09 | [Security & RBAC](#09--security--rbac) |
| 10 | [Environments & Deployment](#10--environments--deployment) |
| 11 | [Status & Gaps](#11--status--gaps) |

---

# 01 — Platform Overview

RightPath takes a candidate from job advert to hiring decision without a
recruiter sitting the screening rounds. Two things separate it from a
conventional applicant tracking system.

**The exams are generated and graded by the platform.** Aptitude papers and
coding problems are produced from the job description by `gpt-4o`, sat in a
locked-down browser exam under camera proctoring, and — for coding — compiled and
executed against test cases on the server.

**The first interview is conducted by an AI.** A voice agent asks questions,
listens, adapts difficulty, watches the candidate through the webcam, and
produces a weighted evaluation the recruiter reviews.

## The two levels

The product splits where automated assessment ends and the interview begins.
That split runs through the codebase, the permissions and this document.

```
┌──────────────────────────── L1 — Assessment ───────────────────────────┐
│  Job post → Apply → ATS screening → Shortlist → Assign exam            │
│      → Pre-exam checks → Aptitude → Coding → EXAM RESULT               │
└────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── L2 — Interview ────────────────────────────┐
│  Schedule → Candidate joins → Voice interview → Recordings stored      │
│      → AI evaluation → SELECTED / REJECTED                             │
└────────────────────────────────────────────────────────────────────────┘
```

## Actors

| Actor | Role | Responsibility |
| --- | --- | --- |
| Super Admin | `SUPER_ADMIN` | Everything, including user activation and role assignment |
| Recruiter / Admin | `ADMIN` | Jobs, screening, exam assignment, interview scheduling, results |
| Candidate | `USER` | Applies, sits exams, sits the interview, views own results |

## Candidate lifecycle as stored state

The application row carries the candidate's position in the funnel.
`ApplicationStatus` is the canonical ladder; `REJECTED` is reachable from any
earlier state.

```
APPLIED → SHORTLISTED → ACKNOWLEDGED → ACKNOWLEDGED_BACK → RECONFIRMED
        → EXAM_SENT → EXAM_COMPLETED                    ◀── L1 ends
        → INTERVIEW_SCHEDULED → INTERVIEW_COMPLETED     ◀── L2
        → SELECTED | REJECTED
```

Alongside the enum, the application row keeps individual string flags —
`atsScanStatus`, `shortlistStatus`, `acknowledgedStatus`, `examLinkStatus`,
`examCompletedStatus`, `writtenTestStatus`, `rejectionStatus` — which drive the
per-column badges on the admin candidate table. `StatusTransitionValidator` keeps
the two representations in step; a new stage must update both.

## Screen map

| Area | Route | Track |
| --- | --- | --- |
| Admin dashboard | `/admin/dashboard` | Platform |
| Jobs — list, create, edit | `/admin/jobs` · `/create` · `/:jobPrefix/edit` | L1 |
| Candidate pipeline | `/admin/candidates` | L1 |
| ATS screening — single, batch | `/admin/ats` · `/admin/ats/batch` | L1 |
| Upload question paper | `/admin/assessments/upload` | L1 |
| Assign assessment | `/admin/assessments/assign` | L1 |
| Assessment results | `/admin/assessments/results` | L1 |
| Candidate result detail | `/admin/assessments/results/:jobPrefix/:email` | L1 |
| Prompts & evaluation categories | `/admin/prompts` | L1 + L2 |
| Interview scheduler | `/admin/interviews/schedule` | L2 |
| Interview results | `/admin/interviews/results` | L2 |
| Users & roles | `/admin/users` | Platform |
| Candidate — apply | `/candidate/apply/:jobPrefix` | L1 |
| Candidate — assessments, instructions | `/candidate/assessments` · `/instructions` | L1 |
| Candidate — exams | `/candidate/exam/aptitude` · `/coding` | L1 |
| Candidate — results | `/candidate/results` · `/results/:id` | L1 |
| Candidate — interview | `/candidate/interviews` · `/interview` · `/summary` | L2 |
| Mobile room-scan companion | `/mobile-connect` | L2 |

## Where the AI is used

| Purpose | Model | Implementation |
| --- | --- | --- |
| Aptitude question generation | `gpt-4o` | `OpenAiServiceImpl.generateQuestions` |
| Coding question generation | `gpt-4o` | `OpenAiServiceImpl.generateCodingQuestions` |
| Interview question generation | `gpt-4o` | `InterviewQuestionsServiceImpl` |
| Interview conversation | `gpt-4o` streaming | `OpenAiStreamingService` |
| Speech → text | `whisper-1` | `SpeechToTextServiceImpl` |
| Text → speech | `tts-1-hd`, voice `nova` | `TextToSpeechService` |
| Room / webcam frame checks | `gpt-4o` vision | `OpenAiVisionServiceImpl` |
| Interview evaluation | `gpt-4o` | `InterviewEvaluationService` |

> **Not an LLM.** Resume-to-JD matching is deterministic: TF-IDF cosine
> similarity plus skill, experience and education scoring in `ATSServiceImpl`.
> It is reproducible and auditable, which matters for a decision that rejects
> candidates.

---

# 02 — System Architecture

## Stack

| Concern | Frontend | Backend |
| --- | --- | --- |
| Core | React 18.3 · TypeScript 5.5 | Spring Boot 3.4.0 · Java 21 |
| Build | Vite 5 | Maven |
| Routing / web | react-router-dom 7 | spring-web + webflux (`WebClient`) |
| Data | axios 1.13 · react-query 5 | Spring Data JPA · Hibernate · MySQL 8 |
| Auth | Token store + interceptors | Spring Security · jjwt 0.11.5 |
| Realtime | @stomp/stompjs 7 · sockjs-client | spring-websocket (STOMP + raw) |
| Forms | react-hook-form 7 · zod 4 | spring-validation |
| Specialist | Monaco · face-api.js · exceljs · jspdf | Tika 2.9 · AWS S3 SDK v2 · Thymeleaf · Twilio 11 · okhttp-sse |
| Styling / docs | Tailwind 3.4 + CSS custom properties | springdoc-openapi 2.7 |

## Runtime topology

```
                  +------------------------------+
                  |  Browser (candidate / admin) |
                  |  React SPA served by nginx   |
                  +------+----------------+------+
               HTTPS/JSON |                | SockJS + STOMP
                          |                | (audio as base64 frames)
                  +-------v----------------v-----+
                  |   Spring Boot API (:8081)    |
                  |  Controllers → Services →    |
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

> **Why it matters.** The exam toolchains run *inside* the API container, not in
> a separate sandbox service. The backend `Dockerfile` installs each language
> runtime and verifies it at build time, so a missing toolchain fails the image
> build in CI rather than a candidate's submission mid-exam.

## How the two apps talk

**REST.** Every path lives in one file — `src/config/api.endpoints.ts`. Nothing
else in the client writes a URL string, so a backend path change is a single
edit. One axios instance in `src/services/api.service.ts` carries
`withCredentials: true` for the refresh cookie, attaches the bearer token on
request, and performs a single-flight refresh on 401. Service modules wrap
endpoints per domain; pages never call axios directly.

**WebSocket.** Two channels, both registered in `WebSocketConfig`: `/ws`
(SockJS + STOMP) carries the voice interview and mobile pairing; `/ws/terminal`
is a raw handler. The broker is simple, on `/queue` and `/topic`, with app prefix
`/app` and user prefix `/user`. `WebSocketAuthInterceptor` authenticates the
handshake and stores the email in session attributes; every message handler then
re-verifies that the schedule being addressed belongs to that email.

**CORS.** `CorsConfig` reads `app.cors.allowed-origins` from the active profile,
allows credentials, and permits `GET, POST, PATCH, PUT, DELETE, OPTIONS`. The
same origin list gates the STOMP endpoint — a missing origin breaks interviews,
not just REST.

## Request path through the backend

```
HTTP request
   |
   +- RequestResponseLoggingFilter   correlation id → MDC "requestId"
   |                                 every log line renders as LEVEL [id] ...
   +- CORS filter
   +- ApiJwtAuthenticationFilter     validates access token, builds the
   |                                 Authentication with permission authorities
   +- SecurityFilterChain            /api/** stateless; small public allowlist
   |
   +- @PreAuthorize("hasAuthority('...')")   method-level permission check
   |
   +- Controller → Service → ServiceImpl → Repository → MySQL
```

## Cross-cutting decisions

| Decision | Reasoning |
| --- | --- |
| Access token in `localStorage`, refresh in an httpOnly cookie | The server rotates the refresh token on every use and treats reuse as theft. A memory-only access token meant every page load spent a rotation — two quick reloads logged the user out. Persisting the short-lived token removes the cause |
| Single-flight refresh, locked across tabs | One in-flight promise per tab plus an origin-wide Web Locks lock, so two tabs cannot both spend the cookie |
| Exam length derived, not stored | Duration = question count × per-question allowance. Add five questions and the exam grows by itself; nobody has to remember to edit a constant |
| Client timeouts above server limits | Compile timeout is 120 s because the server bounds execution at 45 s and queues four submissions. A client that aborts first replaces a typed server error with a generic one |
| Compile once, run many | `CodeExecutionEngine` compiles a submission once and reuses the artifact for every test case, with a deadline per process and a budget for the whole submission |
| Grading is percentage-based | The exam page sends percentage alongside raw score. The pass mark is compared against the percentage — grading raw marks failed papers that had actually passed |
| Assign and notify succeed independently | `assignAssessment` returns a report naming anyone who got the exam but not the mail, so a recruiter can resend rather than find out when the candidate never turns up |

## Repository layout

```
AI-Rightpath/
├── Frontend/airightpath-fe/
│   ├── src/                    application code
│   ├── public/                 static assets incl. face-api models
│   ├── docs/                   this documentation
│   ├── Dockerfile              multi-stage: node build → nginx
│   ├── nginx.conf              SPA fallback to index.html
│   ├── vite.config.ts          @ alias, dev proxy to :8081, host 0.0.0.0
│   └── .env.{development,staging,production}
│
└── Backend/airightpath-be/
    ├── src/main/java/com/rightpath/
    │   ├── config/ controller/ dto/ entity/ enums/ error/ exceptions/
    │   ├── filter/ rbac/ repository/ service/ service/impl/
    │   └── util/ validator/ websocket/
    ├── src/main/resources/
    │   ├── application.properties + application-{dev,stage,uat,prod}.yml
    │   ├── interview-prompts.properties
    │   ├── synonyms.json                 ATS skill synonyms
    │   └── templates/                    Thymeleaf email templates
    ├── docs/                   adr/, migrations/, rbac.md
    ├── Dockerfile              JDK 21 + python3 + node + build-essential
    └── docker-compose.yml      app + MySQL 8 for local use
```

---

# 03 — Backend

Package root `com.rightpath`. Classic layering: controllers hold no business
logic, services are interface + `impl` pairs, repositories are Spring Data.

## Package map

| Package | Contents |
| --- | --- |
| `config` | Security, CORS, WebSocket, async pools, OpenAI client, OpenAPI, RBAC seeding |
| `controller` | 20 classes — REST plus two STOMP message controllers |
| `dto` · `dto/voice` | Request/response types; voice interview payloads |
| `entity` | 26 JPA entities |
| `enums` | 17 domain enums |
| `error` · `exceptions` | Error envelope, custom exceptions, `@ControllerAdvice` |
| `filter` | `ApiJwtAuthenticationFilter`, `RequestResponseLoggingFilter` |
| `rbac` | `RoleName`, `PermissionName` — canonical authority names |
| `repository` | Spring Data interfaces + `JobPostSpecifications` |
| `service` · `service/impl` | 33 interfaces, 32 implementations |
| `util` | PDF generation, prompt placeholders, token hashing, business schedule, synonyms |
| `websocket` | STOMP auth interceptor, socket handlers |

## Controllers

| Controller | Base path | Track | Responsibility |
| --- | --- | --- | --- |
| `AuthenthicationController` | `/api` | Platform | Register, login, refresh, logout, `/me`, OTP, passwords, profile, user list |
| `RbacAdminController` | `/api/admin/rbac` | Platform | Assign and remove roles, inspect roles |
| `JobPostController` | `/api/jobs` | L1 | Job CRUD, counts, job types |
| `JobApplicationForCandidateController` | `/api/job-applications` | L1 | Apply, list, screen, shortlist, referral status, every candidate mail, exam link |
| `ResumeController` | `/api` | L1 | Upload, update, view resume |
| `ATSController` | `/api` | L1 | Single and bulk resume screening |
| `QuestionController` | `/api` | L1 | Generate aptitude and coding questions |
| `AssessmentController` | `/api` | L1 | Upload, assign, fetch, submit, results, reschedule, hourly expiry |
| `CompilerController` | `/api/compiler` | L1 | Run code, save submissions, read code results |
| `ExamProctoringController` | `/api/exam-proctoring` | L1 | Identity photo, room scan, capture reads |
| `InterviewController` | `/api/interview` | L2 | Assign, start, answer, voice lifecycle, recordings, events, stats |
| `VoiceInterviewWebSocketController` | STOMP | L2 | Audio chunks, answers, interrupt, proctoring events |
| `MobileWebSocketController` | STOMP | L2 | Desktop/mobile pairing, WebRTC signalling |
| `MobileVerificationController` | `/api/mobile` | L2 | Room verification from the phone |
| `JobPromptController` | `/api/prompts` | L1 + L2 | Per-job prompts and evaluation categories |

Also present: `CompileController` (public lightweight compile),
`HeaderCountController`, `HealthController`, `WhatsAppController`,
`ErrorPageController`.

## Services by concern

**Identity and access** — `LoginService`, `UserDetailsServiceImpl`, `JwtService`,
`AccessTokenService`, `RefreshTokenService`, `TokenFacade`, `AuthoritiesService`,
`OtpService`, `RbacAdminService`, `RbacAuthorityService`.

**L1 — application and screening** — `JobPostServiceImpl`,
`JobApplicationForCandidateServiceImpl`, `ResumeServiceImpl`, `ATSServiceImpl`.

**L1 — assessments and grading** — `AssessmentServiceImpl`, `OpenAiServiceImpl`,
`CompileService` / `CompilerServiceDiffL` / `LocalCompileService`,
`CodeExecutionEngine`, `ErrorClassifier`, `ExamProctoringServiceImpl`.

**L2 — interview** — `InterviewServiceImpl`, `VoiceInterviewServiceImpl`,
`MainInterviewAiServiceImpl`, `InterviewContextService`,
`InterviewQuestionsServiceImpl`, `InterviewEvaluationService`,
`InterviewReportServiceImpl`, `CandidatePerformanceAnalyzer`,
`ToneAnalysisService`, `SpeechToTextServiceImpl`, `TextToSpeechService`,
`AudioTranscriptionService`, `OpenAiStreamingService`, `OpenAiVisionServiceImpl`,
`RoomVerificationServiceImpl`, `AiRoomVerificationServiceImpl`,
`MobileConnectionServiceImpl`.

**Shared infrastructure** — `EmailServiceImpl` + `EmailAsyncService`,
`S3StorageService` and `AzureBlobStorageService` behind `StorageService`,
`WhatsAppService`, `JobPromptServiceImpl`.

## ATS scoring engine

`ATSServiceImpl` extracts resume text with Tika, tokenises after stripping
stopwords, then combines weighted sub-scores:

- TF-IDF cosine similarity between resume and job description
- Skill match, expanded through `synonyms.json`
- Years-of-experience match, parsed from the resume text
- Education match, from extracted degrees and passing years

The result is clamped to 0–100, written to `matchPercent`, and compared against
`ats.screening.threshold` (default `60.0`). It also extracts the candidate's
email so a bulk upload can attach scores to people.

## Code execution engine

The core of coding assessment, and the most safety-critical component in L1.

- Compiles once and reuses the artifact for every test case; Java compiles
  in-process where the JDK allows, avoiding a second JVM start.
- Python and JavaScript get an up-front syntax check, so a syntax error reports
  as one rather than as N identical crashes.
- Every candidate-code failure — compile error, crash, infinite loop, runaway
  output, wrong answer — is a normal result carrying an `ExecutionStatus`.
  Exceptions are reserved for the platform failing and answer
  `503 COMPILER_UNAVAILABLE`.
- Test cases run in parallel up to `compiler.max-parallel-runs`.

| Key | Default | Meaning |
| --- | ---: | --- |
| `compiler.compile-timeout-seconds` | 20 | Compile step deadline |
| `compiler.run-timeout-seconds` | 5 | One test case |
| `compiler.total-timeout-seconds` | 45 | Compile plus every run |
| `compiler.max-output-bytes` | 65536 | Captured output per run |
| `compiler.max-script-length` | 200000 | Rejects oversized pastes before compiling |
| `compiler.max-parallel-runs` | 4 | Concurrent test-case runs |

Toolchain binaries are configurable via
`compiler.command.{python,node,gcc,gpp,javac,java}`. All these keys carry code
defaults and are absent from the profile YAMLs.

## Async and scheduling

| Pool / job | Cadence or size | Purpose |
| --- | --- | --- |
| `transcriptionExecutor` | 4 core / 8 max | Whisper speech-to-text |
| `ttsExecutor` | 2 core / 4 max | Text-to-speech synthesis |
| `scheduleExpireAssessments` | hourly | Calls `expireAssessments()` |
| `updateExpiredAssessments` | every minute | Bulk-updates rows past their deadline |
| `enforceInterviewTimeouts` | every 5 min | Auto-completes stale `IN_PROGRESS` interviews |
| OTP purge | every 5 min | Removes expired OTPs |

## Persistence and logging

MySQL 8 with `ddl-auto=update` on *every* profile — the schema is
Hibernate-managed and there is no Flyway or Liquibase; changes are recorded by
hand under `docs/migrations/`. `RbacSeedConfig` runs as a `CommandLineRunner` on
boot and idempotently seeds every permission, the `ADMIN` and `USER` roles, and
their default sets.

`RequestResponseLoggingFilter` stamps a correlation id into the MDC and the log
pattern `%5p [%X{requestId:-}]` prints it on every line — empty for non-request
logs such as startup. `ErrorClassifier` turns raw compiler output into a typed
status plus a candidate-readable message.

---

# 04 — Frontend

React 18 + TypeScript, built by Vite, styled with Tailwind over CSS custom
properties. No Redux — shared state lives in five contexts and everything else is
local. `@` is aliased to `src/`.

## Folder map

| Folder | Holds |
| --- | --- |
| `src/config/` | Endpoints, routes, roles, permissions, env, feature configs, messages, validation |
| `src/contexts/` | Auth, Theme, Sidebar, ProfileImage, PendingAssessments |
| `src/hooks/` | 27 hooks — proctoring, media, timers, RBAC, websocket, utility |
| `src/services/` | 15 modules, one per backend domain; the only place axios is used |
| `src/types/` | Shared types mirroring backend DTOs |
| `src/utils/` | Pure functions: scoring, formatting, exports, duration, storage |
| `src/components/ui/` | 30 primitives — Button, Table, Modal, Toast, Badge… |
| `src/components/` | Feature components: admin, admin/result, exam, interview, jobs, auth, layout |
| `src/pages/` | Route components: admin, candidate, auth, public, errors |

## Startup

The provider order in `main.tsx` is deliberate.

```
StrictMode
 └ BrowserRouter
    └ ThemeProvider          theme applies even to an error screen
       └ ErrorBoundary       catches everything below it
          └ AuthProvider     bootstraps the session before any page renders
             └ ToastProvider
                └ ProfileImageProvider
                   └ SidebarProvider
                      └ PendingAssessmentsProvider
                         └ App   (routes)
```

`AuthProvider` reads the persisted access token and, if expired, performs one
refresh before routes evaluate — so a reload does not flash the login page.

## Routing and guards

| Branch | Guard | Layout |
| --- | --- | --- |
| `/` · `/about` · `/contact` · `/mobile-connect` | none | page-owned |
| `/login` · `/register` · `/forgot-password` · `/reset-password` | redirects to role dashboard when signed in | page-owned |
| `/admin/*` | `ProtectedRoute` — ADMIN, SUPER_ADMIN | `Layout` (sidebar + navbar) |
| `/candidate/*` | `ProtectedRoute` — authenticated | `Layout` |
| `/candidate/exam/*` | `ProtectedRoute` | `ExamLayout` — lockdown, no chrome |
| `/candidate/interview/*` | `ProtectedRoute` | `InterviewLayout` — lockdown, no chrome |

Exam and interview have their own layouts precisely so there is no sidebar,
navbar or navigation affordance to click during a proctored session. Finer
gating inside a page uses `PermissionGate` and `RoleGate`, both backed by
`useRbac()` — which exposes `hasRole`, `hasAnyRole`, `hasPermission`,
`hasAnyPermission` and `can`.

## State

| Context | Owns |
| --- | --- |
| `AuthContext` | User, roles, permissions, `isAuthenticated`, login/logout, session bootstrap |
| `ThemeContext` | Light/dark, persisted, applied as CSS variables |
| `SidebarContext` | Collapsed/expanded sidebar |
| `ProfileImageContext` | Avatar bytes, so navbar and profile page share one fetch |
| `PendingAssessmentsContext` | Assessments still to be sat — one fetch feeding both the sidebar dot and the notification bell. Candidates only; for admins it stays empty and never calls the endpoint |

## Service layer rules

1. Pages and components never import axios. They call a service.
2. Services never hardcode a URL. They read `ENDPOINTS`.
3. Only `api.service.ts` configures axios.

| Service | Domain |
| --- | --- |
| `api.service.ts` | Axios instance, token store, interceptors, refresh, error extraction |
| `auth.service.ts` | Login, register, refresh, logout, `/me`, OTP, passwords |
| `user.service.ts` | User list, profile, activate/deactivate, avatar |
| `job.service.ts` | Job CRUD |
| `job-application.service.ts` | Apply, list, screen, shortlist, referral status, all candidate mails |
| `resume.service.ts` | Upload/update/view resume, bulk upload |
| `ats.service.ts` | Batch resume screening |
| `assessment.service.ts` | Upload paper, assign, fetch, submit, save result, reschedule, question generation |
| `compiler.service.ts` | Run code, save unattempted, read code results |
| `exam-proctoring.service.ts` | Identity photo, room scan, capture reads |
| `interview.service.ts` | Assign, results, stats, proctoring events, conversation, room verify |
| `ai.service.ts` | Interview start/answer, voice lifecycle, recordings upload, compile |
| `interview-ws.service.ts` | STOMP client: connect, subscribe, send, binary frames |
| `websocket.service.ts` | Generic socket wrapper with typed handlers |
| `prompt.service.ts` | Job prompts and evaluation categories |

## Hooks

**Exam proctoring (L1)** — `useExamProctoring` composes `useFullscreen`,
`usePageVisibility`, `useFaceDetection`, `useExamCamera`, `useMicNoiseLevel` and
`useBeforeUnload`. The page owns questions, timer and submit; the hook owns
proctoring. `begin()` runs the permission sequence and `markActive()` turns
violation counters on afterwards, so the initial permission prompts never
register as violations. `useDevToolsDetection` and `useIsDesktop` round out the
lockdown.

**Interview media (L2)** — `useVoiceInterview` is the state machine over
`useAudioStreaming`, `useAudioChunking`, `useAudioPlayback`, `useMediaRecorder`,
`useScreenRecorder`, `useSpeechRecognition`, `useSpeechSynthesis`,
`useMobileStream` and `useWebSocket`.

**Shared** — `useTimer`, `useQuestionTimer`, `useNow`, `useDebounce`,
`useLocalStorage`, `usePersistentState`, `useRbac`, `useJobListing`,
`useJobScoreboard`, `useResumeViewer`.

## Utilities worth knowing

| Utility | Purpose |
| --- | --- |
| `exam-duration.utils.ts` | Exam length = question count × per-question allowance, with admin override and clamping |
| `result.utils.ts` | Difficulty banding, coding-row merging, summary totals, submission metadata — shared by admin and candidate views so both quote identical numbers |
| `results-export.utils.ts` | The Excel workbook. ExcelJS is dynamically imported so a large dependency used by one admin button stays out of the bundle every candidate downloads. Cells carry typed values, never display strings |
| `answer-sheet.utils.ts` | PDF answer sheets (jsPDF) |
| `question-paper.utils.ts` | Parsing and counting questions in an uploaded paper |
| `compiler.utils.ts` | `isGraded` / `isPassed` verdict helpers |
| `code.utils.ts` | `isSkeletonCode` — tells an untouched template from a real attempt |
| `jwt.utils.ts` | `isJwtExpired`, used before spending a refresh |
| `datetime.utils.ts` · `format.utils.ts` | `parseStamp` and display formatting for the mixed timestamp shapes the API returns |

## Configuration files

| File | Contents |
| --- | --- |
| `env.ts` | `API_BASE_URL`, `WS_URL`, dev/prod flags |
| `app.config.ts` | Timeouts, file limits, compiler languages, exam and interview timing, pagination, WS reconnect policy |
| `proctoring.config.ts` | Every exam proctoring switch and threshold, driven by `VITE_PROCTORING_*` |
| `coding-exam.config.ts` | Test-case visibility mode: `locked`, `open` or `partial` |
| `api.endpoints.ts` · `routes.ts` | Every backend path · every frontend path |
| `roles.ts` · `permissions.ts` | RBAC name constants |
| `messages.ts` · `error-messages.ts` | User-facing copy in one place |
| `validation.ts` | Shared zod schemas |
| `toast-events.ts` | Lets non-React code (the axios interceptor) raise a toast |

## Build commands

| Command | Does |
| --- | --- |
| `npm run dev` | Vite on `0.0.0.0:5173`, `/api` proxied to `:8081`. The host binding is what lets a phone on the LAN reach it for the room-scan flow |
| `npm run build` | Production bundle to `dist/` |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json` |
| `npm run lint` | ESLint 9 flat config |

---

# 05 — L1 — Assessment Flow

Everything from a job being posted to the aptitude and coding exam results being
available. Twelve stages, each described from both sides.

## 1 · Job post

`JobPostFormPage` serves both create and edit; `AdminJobsPage` lists with
`JobListControls` and `useJobListing`. `ShareJobLink` produces the public apply
URL via `applyJobUrl(jobPrefix)`.

| Endpoint | Permission |
| --- | --- |
| `POST /api/jobs/post` | `JOB_POST_CREATE` |
| `PUT /api/jobs/post/{id}` | `JOB_POST_UPDATE` |
| `DELETE /api/jobs/post/{id}` | `JOB_POST_DELETE` |
| `GET /api/jobs/getPost` · `/counts` · `/job-types` | `JOB_POST_READ` |

`jobPrefix` — not the numeric job id — is the business key used everywhere
downstream: assessments, results, prompts and interviews are all keyed by it.
Deletes are soft (`deletedAt`, `deletedBy`); `JobPostSpecifications` builds the
filtered list queries.

## 2 · Candidate applies

`JobApplicationPage` works from `/candidate/apply` and from the shareable
`/candidate/apply/:jobPrefix`, loading the job from the URL. `ReferralFields`
collects an optional referral.

`POST /api/job-applications/apply` (multipart, `JOB_APPLY`) creates the
application with `status = APPLIED`, storing resume bytes plus filename and
content type. Validation: PDF, DOC, DOCX, 2 MB cap.

Read back with `GET /api/job-applications/{email}`,
`/byJobPrefix/{jobPrefix}`, `/byJobPrefixAndEmail/{jobPrefix}/{email}`.

## 3 · ATS screening

`AtsScreeningPage` handles a single job's applicants, `AtsBatchPage` a folder of
resumes screened against a JD. `AtsResultsTable`, `AtsCandidateDetailModal` and
`ScreeningRunReport` render the outcome.

| Endpoint | Use |
| --- | --- |
| `POST /api/job-applications/screen` | Screen a whole job, or only the emails passed in |
| `POST /api/upload-multiple-resumes` | Batch-screen uploaded resumes against a JD |
| `POST /api/upload-single-resumes` | Single resume |

> **Deprecated.** `GET /api/job-applications/filterByPrefix/{jobPrefix}`
> re-screened the whole job on every GET. The client marks it deprecated and
> uses `/screen` instead.

## 4 · Shortlisting

Automatic shortlisting follows the ATS threshold. Manual is
`PATCH /api/job-applications/shortlist` with `{ jobPrefix, emails, override }`,
letting a recruiter push someone through regardless of score.
`PATCH /referral-status` sets `PENDING`, `VERIFIED` or `REJECTED`.

The pipeline is worked from `CandidateDetailsPage` with `CandidateTable`,
`BulkActionModal` for multi-candidate actions, and `ResumeViewerModal`.

## 5 · Candidate emails

| Endpoint | `EmailType` | Sent when |
| --- | --- | --- |
| `send-ack-mail` | `ACKNOWLEDGEMENT` | Application received / shortlisted |
| `send-reconfirmation-mail` | `RECONFIRMATION` | Candidate must confirm availability |
| `send-exam-link` | `EXAM_SCHEDULE` | Exam window is set |
| `send-success-mail` | `WRITTEN_TEST_SUCCESS` | Passed the exam |
| `send-failure-mail` | `WRITTEN_TEST_FAILURE` | Failed the exam |
| `send-rejection-mail` | `REJECTION` | Rejected at any point |

All require `JOB_APPLICATION_READ_ALL`. `GET /api/job-applications/acknowledge`
is the candidate-side confirmation link target. Sender name, company, portal URL,
support address and test venue come from `app.mail.*`, so branding changes in one
place rather than per template.

## 6 · Question papers

**Uploaded** — `UploadQuestionPaperPage` posts to `POST /api/upload`
(`ASSESSMENT_UPLOAD`). The client parses it with `question-paper.utils.ts` to
detect the question count, which then prices the exam clock.

**Generated** —

| Endpoint | Permission | Produces |
| --- | --- | --- |
| `GET /api/generate-questions?jobPrefix=` | `QUESTION_GENERATE` | Aptitude MCQs |
| `GET /api/generate-coding-questions?jobPrefix=` | `CODING_QUESTION_GENERATE` | Coding problems with test cases |

Both call `gpt-4o` steered by the job's stored prompt (`JobPrompt`,
`PromptType.APTITUDE` / `CODING`). The client allows 330 s, since generation is
slow. Prompts are edited on `JobPromptPage`.

## 7 · Assigning an assessment

`AssignAssessmentPage`, with `ExamDurationFields` and `PassMarkField`. The admin
picks candidates, paper, exam window, per-question allowance and pass percentage.

`POST /api/assign` (`ASSESSMENT_ASSIGN`), or `/api/assign-blob` when the paper is
in object storage. One `Assessment` row is created per candidate carrying
`assessmentType`, `candidateEmail`, `jobPrefix`, `questionPaper`, `answerKey`,
`assignedAt`, `startTime`, `deadline`, `minutesPerQuestion`, `durationMinutes`,
`questionCount`, `estimatedDurationMinutes`, `passPercentage` and storage refs.

> **Field distinction.** `assignedAt` is when the admin assigned it; `startTime`
> is when the exam window opens. They are different fields and must not be
> conflated.

`assignAssessment` returns an `AssignmentReportDTO` naming anyone whose exam was
created but whose email failed, so the recruiter can resend. The client allows
120 s for the call.

**Rescheduling** — `PATCH /api/assessments/{id}/schedule` moves the window of a
paper not yet sat, from `RescheduleExamModal`. `notify` defaults to true
server-side: the candidate was told the old window, so a silent move would leave
them turning up to an exam that has gone.

**Expiry** — a per-minute job bulk-updates rows past their deadline, and an
hourly job calls `expireAssessments()`.

## 8 · Pre-exam checks

`ExamInstructionsPage` gates entry to the exam and runs, in order:

1. **Desktop check** — `useIsDesktop`; phones are refused.
2. **Camera permission** — `useExamCamera`.
3. **Face presence** — `useFaceDetection` at a fast 1 s cadence here, with
   readings trusted only after two settling cycles.
4. **Mic noise** — `useMicNoiseLevel` and `NoiseLevelMeter`: below `NOISE_WARN_DB`
   green, up to `NOISE_BLOCK_DB` amber, above it red once sustained for
   `NOISE_SUSTAIN_MS`. Red blocks the start only if `NOISE_BLOCKS_START` is on.
5. **Identity photo** — `ExamIdentityCheck`, downscaled to `PHOTO_MAX_WIDTH`.
6. **Room scan** — optional 360° sweep capturing `ROOM_SCAN_FRAMES` frames over
   `ROOM_SCAN_DURATION_MS`.

Every step is switchable through `VITE_PROCTORING_*`, so an environment can
loosen or tighten checks without a code change.

| Endpoint | Access |
| --- | --- |
| `POST /api/exam-proctoring/identity-photo` (multipart) | Candidate |
| `POST /api/exam-proctoring/room-scan` (multipart) | Candidate |
| `GET /api/exam-proctoring/assessments/{id}/captures` | `ASSESSMENT_READ` |
| `GET /api/exam-proctoring/captures` · `/captures/{id}/image` | `ASSESSMENT_READ` |

Captures become `ExamProctoringCapture` rows (`IDENTITY_PHOTO` or
`ROOM_SCAN_FRAME`) with the bytes in object storage. Admins view them through
`ProctoringCaptures`.

## 9 · Aptitude exam

`AptitudeAssessmentPage`, rendered inside `ExamLayout` — no sidebar, no navbar.

**Load** — `GET /api/fetchAssessment/{id}` returns the paper;
`normalizeQuestions` handles both option shapes the backend emits
(`{"A":"…","B":"…"}` and the legacy array). `POST /api/markExamAttended` records
the start.

**Clock** — `computeExamMinutes()` = question count × `minutesPerQuestion`
(default 1 for aptitude), with the assignment's override winning.
`EXAM_TIMER_MINUTES` = 120 is only a fallback for a paper whose count is unknown.

**Proctoring** — `useExamProctoring` enforces fullscreen, counts tab switches and
face warnings, and calls `onAutoSubmit(reason)` when a limit is hit.
`useBeforeUnload` warns on reload, because a reload restarts the paper with a
fresh clock.

**Submit** — manual, or automatic on timeout or violation. The page computes
`score`, `totalMarks` and `percentage = round(score / totalMarks × 100)`, then
`POST /api/result` (`ASSESSMENT_RESULT_SUBMIT`) with the answer JSON as body and
the rest as query params. `buildSubmissionMeta()` attaches a `__submissionMeta`
block recording `MANUAL` vs `AUTO`, the reason, client timestamp, seconds left
and duration — which is how result screens can later say "auto-submitted,
proctoring, 20 min left".

> The percentage is sent explicitly because raw marks are not a percentage.
> Grading raw marks against a pass percentage failed papers that had actually
> passed.

## 10 · Coding exam

`CodingAssessmentPage` — the largest screen in the app (~1400 lines), same
`ExamLayout` lockdown.

| Aspect | Behaviour |
| --- | --- |
| Editor | Monaco, languages Java, Python, C, C++, JavaScript |
| Clock | 25 minutes per question by default |
| Run | `POST /api/compiler/run` — compiles once, runs every case, returns a per-case `ExecutionStatus`. Client timeout 120 s, above the server's 45 s bound so typed errors survive |
| Test-case visibility | `locked` (nothing shown until a case passes), `open`, or `partial` (first N open, rest unlock as they pass) |
| Unattempted | Recorded separately so a blank is distinguishable from a failed attempt; `isSkeletonCode` tells an untouched template from a real attempt |
| Submit | Same path as aptitude, with submission metadata attached |

Submissions persist as `CodeSubmission` (script, language, `questionId`,
`answersJson`, `attempted`, `passed`) with a `TestResultEntity` per case
recording input, expected, actual, status, error and `executionTimeMs`.

## 11 · Grading

- Aptitude: correct answers vs answer key, converted to a percentage on the
  client and re-checked server-side.
- Coding: test cases passed, banded by the paper's difficulty labels.
- Verdict: `percentage >= assessment.passPercentage` → `ResultStatus.PASSED`,
  else `FAILED`. Default pass mark is on the `Assessment` row, overridable per
  assignment.

A `Result` row stores `score`, `totalMarks`, `percentage`, `status`,
`submittedAt`, the full `resultsJson`, and links to assessment, candidate and job.

## 12 · Results and export

**Admin** — `ResultsPage` aggregates per candidate: aptitude and coding attempts,
latest of each, code submissions, overall status (`PASSED` / `FAILED` /
`PARTIAL`). `CandidateResultDetailPage` drills in with `BandCards`,
`TestCaseCard`, `CodeBlock`, `ProctoringCaptures` and `AssessmentStanding`.

**Candidate** — `ResultsListPage` and `ResultDetailPage`. Both sides compute
through `result.utils.ts`, so admin and candidate always quote identical numbers.

| Endpoint | Permission |
| --- | --- |
| `GET /api/get-results?email=&jobPrefix=` | authenticated |
| `GET /api/get-results-by-job-prefix?jobPrefix=` | `JOB_APPLICATION_READ_ALL` |
| `GET /api/get-results-by-id/{id}` | authenticated |
| `GET /api/compiler/results/code` · `/results/by-job-prefix` | `COMPILER_RESULTS_READ` |

**Exports** — an Excel workbook via `results-export.utils.ts` (ExcelJS
dynamically imported; typed cells so a recruiter can sort and average; includes a
final summary sheet with per-candidate performance metrics), PDF answer sheets
via `answer-sheet.utils.ts`, and question-paper export.

> **Colour rule.** `scoreColor()` lets a recorded verdict win over the 80/60
> heuristic bands. Without that, a module that PASSED on 45% was drawn red beside
> its own green PASSED badge — telling the reviewer two opposite things about one
> result.

**L1 ends here.** Once results exist, an admin decides who moves to the interview.

---

# 06 — L2 — Interview Flow

Begins after L1 results exist. A recruiter schedules the AI voice interview, the
candidate sits it in the browser, and the platform produces a weighted evaluation
and a verdict.

Longer companions, still current:
[AI-Interview-Process-Overview.md](AI-Interview-Process-Overview.md),
[AI-Interview-Technical-Flow.md](AI-Interview-Technical-Flow.md),
[../VOICE_INTERVIEW_ARCHITECTURE.md](../VOICE_INTERVIEW_ARCHITECTURE.md).

## 1 · Evaluation categories and prompts

`JobPromptPage` on the front; `JobPromptController` (`/api/prompts`,
`JOB_POST_CREATE`) on the back.

`JobPrompt` is keyed by `(jobPrefix, promptType, promptStage)` where type is
`APTITUDE | CODING | INTERVIEW` and stage is `START | SUMMARY`.
`EvaluationCategory` is keyed by `(jobPrefix, categoryName)` and carries a
`weight` and description — those weights are what the final score is computed
against.

Base prompt text lives in `interview-prompts.properties`, with placeholders
resolved by `PromptPlaceholderResolver`.

## 2 · Interview questions

| Endpoint | Permission |
| --- | --- |
| `POST /api/interview/upload-interview-questions` (multipart) | `INTERVIEW_ASSIGN` |
| `POST /api/interview/update-questions/{jobPrefix}` | `INTERVIEW_ASSIGN` |
| `GET /api/interview/questions` | `INTERVIEW_START` |

Uploaded files become `UploadInterviewQuestions` rows; per-schedule questions
become `InterviewQuestion` rows. `OpenAiServiceImpl.generateQuestionsForCategories`
can generate questions per evaluation category (`questions.additional.count`
defaults to 100).

## 3 · Scheduling

`InterviewSchedulerPage` on the front. `POST /api/interview/assign-interview` and
`/assign-interview-bulk` (both `INTERVIEW_ASSIGN`) each create a
`CandidateInterviewSchedule` with `jobPrefix`, `email`, `questionsFromDate`,
`questionsToDate`, `assignedAt`, `deadlineTime`, `attemptStatus = NOT_ATTEMPTED`,
`currentPhase = INTRODUCTION`, `difficultyLevel = 2`,
`interviewerName = "Sarah"`. The candidate is mailed
(`EmailType.INTERVIEW_SCHEDULE`) and the application moves to
`INTERVIEW_SCHEDULED`.

`POST /api/job-applications/schedule-interview` is the equivalent trigger from
the candidate-pipeline screen.

## 4 · Candidate joins

`InterviewListPage` lists active interviews (`GET /api/interview/active`), then
`InterviewPage` runs inside `InterviewLayout` — the same no-chrome lockdown as
the exam. `InterviewPreStartScreen` handles permissions and a 30-second
countdown.

**Optional phone room scan.** The desktop shows a QR code; the phone opens
`/mobile-connect` and the two pair over STOMP, then exchange WebRTC
offer/answer/ICE so the phone's camera streams to the desktop session.

| Direction | Destination |
| --- | --- |
| Desktop → server | `/app/desktop/register` |
| Phone → server | `/app/mobile/register` |
| Phone → server | `/app/mobile/offer/{token}` |
| Desktop → server | `/app/mobile/answer/{token}` |
| Both → server | `/app/mobile/ice/{token}` |
| Phone → server | `/app/mobile/verified/{token}` |
| Server → client | `/user/queue/mobile/{offer,answer,ice,ready,verified,warning}` |

Room images can also be checked by `gpt-4o` vision through
`AiRoomVerificationService`, producing a `RoomVerificationSession` with status
`PENDING | VERIFIED | FAILED`. REST equivalents:
`POST /api/interview/verification-session`, `/verify-room`,
`GET /verification-status`, plus `/api/mobile/verify-room` and `/api/mobile/monitor`.

## 5 · The interview

`POST /api/interview/voice/start` (`INTERVIEW_START`) sets
`attemptStatus = IN_PROGRESS` and `startedAt`, then returns the opening question.
The client hook is `useVoiceInterview`.

Transport is SockJS + STOMP on `/ws`. SockJS carries only text frames, so audio
is base64-encoded inside JSON, capped at 200 KB per chunk server-side.

| Direction | Destination | Payload |
| --- | --- | --- |
| Client → server | `/app/interview/{scheduleId}/audio-chunk` | `{ audio: base64 }`, max 200 KB |
| Client → server | `/app/interview/{scheduleId}/submit-answer` | `VoiceAnswerRequest` |
| Client → server | `/app/interview/{scheduleId}/interrupt` | Candidate barge-in |
| Client → server | `/app/interview/{scheduleId}/proctoring-event` | Event type + details |
| Server → client | `/topic/interview/{id}/transcription` | Live transcript |
| Server → client | `/topic/interview/{id}/transcription-error` | Errors including auth failures |
| Server → client | `/topic/interview/{id}/ai-token` | Streaming answer tokens |
| Server → client | `/topic/interview/{id}/response-complete` | End of the AI turn |
| Server → client | `/topic/interview/{id}/tts-audio` | Synthesised speech |
| Server → client | `/topic/interview/{id}/tts-fallback` | Use browser speech synthesis |
| Server → client | `/topic/interview/{id}/filler` | Filler phrase while the model works |

Every handler calls `verifyOwnership(scheduleId, headerAccessor)` — the schedule
must belong to the authenticated email from the handshake, or the message is
dropped and an error published. Answers are deduplicated by
`scheduleId + transcript hash` for 60 s, with a daemon thread pruning the map
every 5 minutes.

### Phases

| Phase | Minutes | Target questions | Focus |
| --- | ---: | ---: | --- |
| `INTRODUCTION` | 3 | 2 | Warm-up |
| `BACKGROUND` | 8 | 3 | Resume and experience |
| `TECHNICAL` | 20 | 6 | Role-specific technical |
| `PROBLEM_SOLVING` | 12 | 3 | Scenario and system design |
| `BEHAVIORAL` | 10 | 3 | STAR-format behavioural |
| `CLOSING` | 5 | 1 | Wrap-up and candidate questions |

`difficultyLevel` (1–5, starting at 2) moves with answer quality.
`runningSummary` keeps the conversation inside the context window
(`interview.context-window-size` = 4 recent turns plus the summary), maintained by
`InterviewContextService`.

**Coding inside the interview** — `CodingEditor` lets the AI set a coding task
mid-interview; the answer is stored on the conversation entry as `codeContent` +
`codeLanguage`.

**Proctoring** — face detection, tab/visibility checks and devtools detection run
continuously and publish to `/app/interview/{id}/proctoring-event`, stored as
`ProctoringEvent` rows and readable at
`GET /api/interview/{scheduleId}/proctoring-events`. `warningCount` drives
escalation (`interview.max-warnings` = 5).

**Recordings** — `useMediaRecorder` and `useScreenRecorder` post chunks to
`POST /api/interview/{id}/video` and `/screen-recording` (15 s video chunks, 4 s
audio chunks, `audio/webm;codecs=opus`). S3 keys are kept on the schedule as
`recordReferences` / `screenRecordReferences`.

**Timing guards** — client-side inactivity warning at 120 s and timeout at 180 s;
question timeouts of 300 s (600 s for coding). Server-side, a job every 5 minutes
auto-completes any `IN_PROGRESS` interview older than
`interview.max-duration-minutes` (60).

## 6 · Ending

| `CompletionReason` | Trigger |
| --- | --- |
| `NATURAL_COMPLETION` | All phases finished |
| `CANDIDATE_ENDED` | Candidate ended it |
| `TIMEOUT` | Duration exceeded — client, or the 5-minute server sweep |
| `PROCTORING_VIOLATION` | Warning ceiling reached |
| `MAX_SKIPS` | `INTERVIEW_MAX_CONSECUTIVE_SKIPS` = 3 |
| `EARLY_TERMINATION_POOR_PERFORMANCE` | Heuristics below |

Early termination (`interview.early-termination.*`, dev defaults): only after
`min-questions` = 4, when skip ratio > 0.5, average word count < 15, confidence
< 30.0, 2 consecutive skips, or 3 consecutive short answers.

`POST /api/interview/voice/{id}/end` closes the session and sets `endedAt` and
`attemptStatus = COMPLETED`. `GET /api/interview/voice/{scheduleId}/resume`
restores an interrupted interview; `/status` reports where it is.

## 7 · Evaluation

`InterviewEvaluationService` scores the transcript against the job's
`EvaluationCategory` weights using `gpt-4o`, and `CandidatePerformanceAnalyzer` /
`ToneAnalysisService` add delivery metrics computed from the stored
`VoiceConversationEntry` rows: `wordCount`, `wordsPerMinute`, `fillerWordCount`,
`confidenceScore`, `speechDurationSeconds`.

The result is written to `evaluationJson` on the schedule and `interviewResult` is
set to `PASSED`, `FAILED` or `PENDING`. `InterviewReportServiceImpl` +
`PdfReportGenerator` produce the PDF report. Read back with
`GET /api/interview/voice/{id}/evaluation` and rendered by
`EvaluationBreakdown` on `InterviewSummaryPage`.

## 8 · Admin review

`InterviewResultsPage`, backed by (all `INTERVIEW_ASSIGN`):

| Endpoint | Returns |
| --- | --- |
| `GET /api/interview/results?jobPrefix=` | All interview results for a job |
| `GET /api/interview/results/{id}` | One interview in full |
| `GET /api/interview/stats?jobPrefix=` | Aggregate stats |
| `GET /api/interview/{scheduleId}/conversation` | Full transcript |
| `GET /api/interview/{scheduleId}/proctoring-events` | Every event raised |

From there the application moves to `INTERVIEW_COMPLETED`, then `SELECTED` or
`REJECTED`.

## Model and thread summary

| Purpose | Model | Pool |
| --- | --- | --- |
| Conversation | `gpt-4o` streaming (okhttp-sse) | request thread |
| Speech → text | `whisper-1` | `transcriptionExecutor` (4/8) |
| Text → speech | `tts-1-hd`, voice `nova` | `ttsExecutor` (2/4) |
| Vision / room checks | `gpt-4o` vision | request thread |
| Evaluation | `gpt-4o` | request thread |

---

# 07 — API Reference

**Auth** is `public` for the security allowlist, `auth` for any valid access
token, otherwise the `@PreAuthorize` authority name. **L** is the track.
Client-side path constants live in `src/config/api.endpoints.ts`. Interactive
spec at `/swagger-ui.html`, raw at `/v3/api-docs`.

## Authentication and users

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/register` | public |
| POST | `/api/login` | public |
| POST | `/api/refresh` | public (refresh cookie) |
| POST | `/api/logout` | public |
| GET | `/api/me` | auth |
| POST | `/api/generate-otp` · `/api/validate-otp` | public |
| PUT | `/api/update-password` | public (post-OTP) |
| PUT | `/api/change-password` | `USER_UPDATE` |
| GET | `/api/users` | `USER_LIST` |
| GET | `/api/profile-details/{email}` | `USER_READ` |
| PUT | `/api/update/{email}` | `USER_UPDATE` |
| GET | `/api/profile-image/{email}` | `USER_READ` |
| POST | `/api/updateActive` · `/api/updateDeactive` | `USER_ACTIVATE` · `USER_DEACTIVATE` |

## RBAC administration

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/admin/rbac/assign-role` · `/remove-role` | `USER_UPDATE` |
| GET | `/api/admin/rbac/user` · `/roles` | `USER_READ` |

## Jobs — L1

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/jobs/post` | `JOB_POST_CREATE` |
| PUT | `/api/jobs/post/{id}` | `JOB_POST_UPDATE` |
| DELETE | `/api/jobs/post/{id}` | `JOB_POST_DELETE` |
| GET | `/api/jobs/getPost` · `/counts` · `/job-types` | `JOB_POST_READ` |
| POST | `/api/jobs/apply/{jobId}` | `JOB_APPLY` |
| GET | `/api/jobs/applications/count/{jobId}` | `JOB_APPLICATION_READ_ALL` |

## Job applications — L1

> This whole prefix is in the security allowlist in `ApiSecurityConfig`, so
> authorization is enforced entirely by the `@PreAuthorize` annotations below.

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/apply` (multipart) | `JOB_APPLY` |
| PATCH | `/update` (multipart) | `JOB_APPLY` |
| GET | `/{email}` | `JOB_APPLY` |
| GET | `/byJobPrefixAndEmail/{jobPrefix}/{email}` | `JOB_APPLY` |
| GET | `/acknowledge` | `JOB_APPLY` |
| GET | `/getAllApplications` | `JOB_APPLICATION_READ_ALL` |
| GET | `/byJobPrefix/{jobPrefix}` | `JOB_APPLICATION_READ_ALL` |
| GET | `/filter/{jobPostId}` · `/applicants/{jobPostId}` | `JOB_APPLICATION_READ_ALL` |
| GET | `/filterByPrefix/{jobPrefix}` | `JOB_APPLICATION_READ_ALL` — **deprecated** |
| GET | `/ats-screening/{jobPrefix}` · `/ats-rejected/{jobPrefix}` | `JOB_APPLICATION_READ_ALL` |
| POST | `/screen` | `JOB_APPLICATION_READ_ALL` |
| PATCH | `/shortlist` · `/referral-status` | `JOB_APPLICATION_READ_ALL` |
| POST | `/send-ack-mail` · `/send-reconfirmation-mail` · `/send-rejection-mail` | `JOB_APPLICATION_READ_ALL` |
| POST | `/send-exam-link` · `/send-success-mail` · `/send-failure-mail` | `JOB_APPLICATION_READ_ALL` |
| POST | `/update-written-test-status` | `JOB_APPLICATION_READ_ALL` |
| POST | `/schedule-interview` | `JOB_APPLICATION_READ_ALL` |

## Resumes and ATS — L1

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/upload-resume` | `RESUME_UPLOAD` |
| PUT | `/api/update-resume` | `RESUME_UPDATE` |
| GET | `/api/view-resume/{email}` | `RESUME_VIEW` |
| POST | `/api/upload-single-resumes` | auth |
| POST | `/api/upload-multiple-resumes` | `ATS_UPLOAD_MULTI` |

## Assessments — L1

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/generate-questions?jobPrefix=` | `QUESTION_GENERATE` |
| GET | `/api/generate-coding-questions?jobPrefix=` | `CODING_QUESTION_GENERATE` |
| POST | `/api/upload` | `ASSESSMENT_UPLOAD` |
| POST | `/api/assign` · `/api/assign-blob` | `ASSESSMENT_ASSIGN` |
| PATCH | `/api/assessments/{id}/schedule` | `ASSESSMENT_ASSIGN` |
| GET | `/api/getCandidateAssessments/{email}` | auth — pending only (expired and attended filtered out) |
| GET | `/api/getAssessments?candidateEmail=` | auth — everything, attended included |
| GET | `/api/fetchAssessment/{id}` · `/api/assessment-content/{id}` | auth |
| GET | `/api/assessments/{id}/content` · `/api/assessments/content/latest` | auth |
| GET | `/api/question-paper` | auth |
| POST | `/api/markExamAttended` | auth |
| POST | `/api/submit/{id}` | `ASSESSMENT_SUBMIT` |
| POST | `/api/result` | `ASSESSMENT_RESULT_SUBMIT` |
| GET | `/api/get-results?email=&jobPrefix=` · `/api/get-results-by-id/{id}` | auth |
| GET | `/api/get-results-by-job-prefix?jobPrefix=` | `JOB_APPLICATION_READ_ALL` |

`POST /api/result` takes the answer JSON as the **body** and `candidateEmail`,
`assessmentType`, `score`, `jobPrefix`, `assessmentId`, `totalMarks`,
`percentage` as **query params**. `percentage` is what the pass mark is compared
against.

## Code execution — L1

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/compiler/run` | `COMPILER_RUN` |
| POST | `/api/compiler/saveUnattemptedSubmissions` | `COMPILER_RUN` |
| GET | `/api/compiler/results` · `/results/code` · `/results/by-job-prefix` | `COMPILER_RESULTS_READ` |
| GET | `/api/compiler/results/{userEmail}/{language}` | `COMPILER_RESULTS_READ` |
| GET | `/api/compiler/results/{userEmail}/question/{questionId}` | `COMPILER_RESULTS_READ` |
| GET | `/api/compiler/results/{userEmail}/passed/{passed}` · `/filter` | `COMPILER_RESULTS_READ` |
| POST | `/api/compile` | public |

> The client's `COMPILER.SAVE_UNATTEMPTED` points at
> `/api/compiler/save-unattempted`, which does not exist — see section 11.

## Exam proctoring — L1

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/exam-proctoring/identity-photo` (multipart) | auth (candidate) |
| POST | `/api/exam-proctoring/room-scan` (multipart) | auth (candidate) |
| GET | `/api/exam-proctoring/assessments/{assessmentId}/captures` | `ASSESSMENT_READ` |
| GET | `/api/exam-proctoring/captures` · `/captures/{captureId}/image` | `ASSESSMENT_READ` |

## Interview — L2

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/interview/assign-interview` · `-bulk` | `INTERVIEW_ASSIGN` |
| GET | `/api/interview/results` · `/results/{id}` · `/stats` | `INTERVIEW_ASSIGN` |
| GET | `/api/interview/{id}/proctoring-events` · `/conversation` | `INTERVIEW_ASSIGN` |
| GET | `/api/interview/active` | `INTERVIEW_START` |
| POST | `/api/interview/start` · `/voice/start` | `INTERVIEW_START` |
| POST | `/api/interview/answer` · `/voice-to-text` (multipart) | `INTERVIEW_ANSWER` |
| POST | `/api/interview/{id}/video` · `/screen-recording` (multipart) | `INTERVIEW_ANSWER` |
| POST | `/api/interview/voice/{id}/end` | `INTERVIEW_ANSWER` |
| GET | `/api/interview/voice/{id}/status` · `/evaluation` · `/resume` | `INTERVIEW_START` |
| POST | `/api/interview/upload-interview-questions` · `/update-questions/{prefix}` | `INTERVIEW_ASSIGN` |
| GET | `/api/interview/questions` | `INTERVIEW_START` |
| POST | `/api/interview/verification-session` · `/verify-room` | auth |
| GET | `/api/interview/verification-status` | auth |

## Prompts — L1 + L2

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/prompts/{prefix}` | `JOB_POST_CREATE` |
| POST | `/api/prompts` | `JOB_POST_CREATE` |
| GET | `/api/prompts/evaluation-categories/{prefix}` | `JOB_POST_CREATE` |
| POST | `/api/prompts/evaluation-categories` | `JOB_POST_CREATE` |

## Platform and messaging

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/mobile/verify-room` · `/api/mobile/monitor` | public |
| POST | `/whatsapp/send` | auth |
| GET | `/header-count` | auth |
| GET | `/actuator/health` | public |

Actuator exposes only `health` and `info`.

## WebSocket

**Endpoints** — `/ws` (SockJS + STOMP), `/ws/terminal` (raw handler).
**Broker** — simple broker on `/queue` and `/topic`; app prefix `/app`; user
prefix `/user`. Origins come from `app.cors.allowed-origins`. Handshake auth by
`WebSocketAuthInterceptor`; every message handler re-verifies schedule ownership.

Interview and mobile destinations are listed in section 06.
`/topic/jobPosts` broadcasts job-list changes.

---

# 08 — Data Model

MySQL 8, Hibernate-managed (`ddl-auto=update` on every profile). No Flyway or
Liquibase — schema changes are hand-recorded under `backend/docs/migrations/`.
26 entities, 17 enums.

## Entity relationships

```
Users (PK email)
 ├─< UserRole >─ Role >─ Permission            RBAC
 ├─< RefreshToken                              sessions
 ├─< JobApplicationForCandidate >─ JobPost
 ├─< Assessment >─ Result
 ├─< CodeSubmission >─ TestResultEntity
 └─< CandidateInterviewSchedule
        ├─< VoiceConversationEntry
        ├─< ProctoringEvent
        └─< InterviewQuestion (by interviewScheduleId)

JobPost (business key: job_prefix)
 ├─< JobApplicationForCandidate
 ├─< JobPrompt              (jobPrefix, promptType, promptStage) unique
 ├─< EvaluationCategory     (jobPrefix, categoryName) unique
 ├─< Assessment · Result · CandidateInterviewSchedule

Assessment ──1:1── Result
Assessment ──<   ExamProctoringCapture   (identity photo, room scan frames)
```

`jobPrefix` — not the numeric job id — is the join key across assessments,
results, prompts, categories and interviews.

## Identity and access

### `Users` — table `users`

Primary key is **`email`**, not a surrogate id.

| Column | Type | Notes |
| --- | --- | --- |
| `email` | PK | |
| `firstName`, `lastName` | | |
| `password` | | BCrypt |
| `enabled` | boolean | default true |
| `mobileNumber` | unique, not null | |
| `alternativeMobileNumber` | | |
| `profileImage` | `LONGBLOB` | avatar bytes in the DB |
| `createdAt`, `updatedAt` | | |

### `Role`, `Permission`, `UserRole`

`Role` — `id`, `name` (`RoleName`, unique, varchar(50)), many-to-many to
`Permission`. `Permission` — `id`, `name` (`PermissionName`, unique, varchar(100)).
`UserRole` — `id`, `user` → `users.email`, `role` → `roles.id` (eager), `active`
boolean. A join entity rather than a plain join table so a role can be
deactivated without being deleted.

### `RefreshToken`

`id` (UUID), `userEmail`, `sessionId` (UUID), `tokenHash` (SHA-256, unique, 64
chars — the raw token is never stored), `createdAt`, `lastUsedAt`, `expiresAt`,
`revokedAt`, `replacedByTokenId`, `ipAddress`, `userAgent`.
`replacedByTokenId` is what makes rotation auditable and reuse detectable.

### `Otp` — table `OTP`

`id`, `email`, `mobile`, `otp`, `expirationTime`. Purged every 5 minutes.

## L1 — jobs, applications, screening

### `JobPost`

`id`, `jobPrefix` (unique business key), `jobTitle`, `companyName`, `location`,
`jobDescription` (3000), `keySkills`, `experience`, `education`, `salaryRange`,
`jobType`, `industry`, `department`, `role`, `numberOfOpenings`, `contactEmail`,
`applicationDeadline`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt`,
`deletedBy` (soft delete), `jobApplications` (one-to-many, cascade).

### `JobApplicationForCandidate`

`id`, `firstName`, `lastName`, `experience`, `address`, `jobRole`,
`mobileNumber`, `resumeFileName`, `resumeData` (`@Lob`), `contentType`,
`matchPercent` (the ATS score), `referralId`, `referralName`, `referralStatus`,
`user` → `users.email`, `jobPost` → `job_prefix`, `status` (`ApplicationStatus`),
`examDate`, `examTime`, `createdAt`, `updatedAt`.

Plus per-stage string flags driving the admin table's column badges:
`atsScanStatus`, `shortlistStatus`, `confirmationStatus`, `acknowledgedStatus`,
`reconfirmationStatus`, `examLinkStatus`, `examCompletedStatus`,
`rejectionStatus`, `writtenTestStatus`, `interview`.

> Two parallel representations of progress — the `status` enum and the flags —
> are kept in step by `StatusTransitionValidator`. Update both when adding a
> stage.

## L1 — assessments and results

### `Assessment`

| Column | Notes |
| --- | --- |
| `id` | |
| `assessmentType` | `APTITUDE` / `CODING` |
| `candidateEmail`, `jobPrefix`, `uploadedBy` | also mapped as lazy read-only relations |
| `questionPaper` | `TEXT` |
| `answerKey` | `@Lob` |
| `examAttended`, `expired`, `adminAcceptance` | flags |
| `assignedAt` | when the admin assigned it |
| `startTime` | when the exam window opens — **not** the same as `assignedAt` |
| `deadline` | window close |
| `examStartedAt` | when the candidate actually began |
| `containerName`, `fileName` | object-storage location of the paper |
| `minutesPerQuestion` | admin override of the per-question allowance |
| `durationMinutes`, `questionCount`, `estimatedDurationMinutes` | derived timing |
| `passPercentage` | defaults to `DEFAULT_PASS_PERCENTAGE` |
| `result` | one-to-one |

### `Result`

`id`, `candidateEmail`, `assessmentType`, `submittedAt`, `score`, `totalMarks`,
`percentage`, `status` (`ResultStatus`), `resultsJson` (`TEXT` — the full answer
breakdown plus the `__submissionMeta` block), `assessment`, `jobPrefix`.
`percentage` is the graded value; `score` is raw marks.

### `CodeSubmission` · `TestResultEntity` · `TestCase`

`CodeSubmission` — `id`, `language`, `script` (10000), `userEmail`, `jobPrefix`,
`questionId`, `assessmentId`, `createdAt`, `passed`, `attempted`, `answersJson`
(`TEXT`), `testResults` (one-to-many).

`TestResultEntity` — `id`, `input`, `expectedOutput`, `actualOutput` (all `@Lob`),
`testCasesJson`, `passed`, `status` (32), `errorMessage` (`TEXT`),
`executionTimeMs`, `questionId`, `submission`.

`TestCase` — value type: `input`, `expectedOutput`, `passed`.

### `ExamProctoringCapture`

`id`, `assessmentId`, `candidateEmail`, `jobPrefix`, `captureType`
(`IDENTITY_PHOTO` / `ROOM_SCAN_FRAME`), `frameIndex`, `containerName`,
`fileName`, `contentType`, `sizeBytes`, `capturedAt`, `uploadedAt`. Image bytes
live in object storage, not in MySQL.

## L2 — interview

### `CandidateInterviewSchedule`

The interview aggregate root.

| Column | Notes |
| --- | --- |
| `id`, `jobPrefix`, `email` | |
| `questionsFromDate`, `questionsToDate` | interview window |
| `assignedAt`, `deadlineTime`, `startedAt`, `endedAt` | |
| `attemptStatus` | `NOT_ATTEMPTED` / `IN_PROGRESS` / `COMPLETED` |
| `interviewResult` | `PASSED` / `FAILED` / `PENDING` |
| `currentPhase` | `InterviewPhase`, starts `INTRODUCTION` |
| `difficultyLevel` | 1–5, starts at 2 |
| `questionsAskedInPhase`, `totalQuestionsAsked` | |
| `runningSummary` | `TEXT` — keeps the model inside its context window |
| `warningCount` | proctoring escalation |
| `completionReason` | `CompletionReason` |
| `evaluationJson` | `LONGTEXT` — the scored evaluation |
| `interviewerName` | default `Sarah` |
| `recordReferences`, `screenRecordReferences`, `summaryReferences` | `TEXT`, S3 keys (the column is spelled `summery_references`) |

### `VoiceConversationEntry`

`id`, `interviewSchedule`, `role` (`SYSTEM` / `INTERVIEWER` / `CANDIDATE`),
`content` (`TEXT`), `timestamp`, plus delivery metrics: `wordCount`,
`wordsPerMinute`, `fillerWordCount`, `confidenceScore`, `speechDurationSeconds`,
and for coding answers `codeContent` + `codeLanguage`.

### Others

`ProctoringEvent` — `id`, `schedule`, `eventType`, `details` (`TEXT`), `timestamp`.
`InterviewQuestion` — `id`, `interviewScheduleId`, `uniqueId`, `level`,
`questionText` (`TEXT`), `count`.
`UploadInterviewQuestions` — `id`, `jobPrefix`, `fileName`, `language`.
`InterviewSession` — in-memory only, not an entity.
`RoomVerificationSession` — `id`, `sessionId` (unique), `status`, `reason`,
`imageUrl`, `createdAt`, `verifiedAt`.

## Configuration entities

`JobPrompt` — `id`, `jobPrefix`, `promptType`, `promptStage`, `prompt` (`TEXT`),
`jobPost`, timestamps. Unique on `(job_prefix, prompt_type, prompt_stage)`.

`EvaluationCategory` — `id`, `jobPrefix`, `categoryName`, `weight`,
`description`, timestamps. Unique on `(job_prefix, category_name)`. The weights
drive the interview score.

## Enums

| Enum | Values |
| --- | --- |
| `ApplicationStatus` | `APPLIED`, `SHORTLISTED`, `ACKNOWLEDGED`, `ACKNOWLEDGED_BACK`, `RECONFIRMED`, `EXAM_SENT`, `EXAM_COMPLETED`, `INTERVIEW_SCHEDULED`, `INTERVIEW_COMPLETED`, `SELECTED`, `REJECTED` |
| `AssessmentType` | `APTITUDE`, `CODING` |
| `ResultStatus` | `PASSED`, `FAILED` |
| `ExecutionStatus` | `PASSED`, `WRONG_ANSWER`, `COMPILE_ERROR`, `RUNTIME_ERROR`, `TIMEOUT`, `OUTPUT_LIMIT_EXCEEDED`, `NOT_RUN`, `INTERNAL_ERROR` |
| `AttemptStatus` | `NOT_ATTEMPTED`, `IN_PROGRESS`, `COMPLETED` |
| `InterviewStatus` | `ACTIVE`, `IN_PROGRESS`, `COMPLETED` |
| `InterviewResult` | `PASSED`, `FAILED`, `PENDING` |
| `InterviewPhase` | `INTRODUCTION`(3 min/2 q), `BACKGROUND`(8/3), `TECHNICAL`(20/6), `PROBLEM_SOLVING`(12/3), `BEHAVIORAL`(10/3), `CLOSING`(5/1) |
| `CompletionReason` | `NATURAL_COMPLETION`, `EARLY_TERMINATION_POOR_PERFORMANCE`, `CANDIDATE_ENDED`, `PROCTORING_VIOLATION`, `TIMEOUT`, `MAX_SKIPS` |
| `ConversationRole` | `SYSTEM`, `INTERVIEWER`, `CANDIDATE` |
| `ProctoringCaptureType` | `IDENTITY_PHOTO`, `ROOM_SCAN_FRAME` |
| `VerificationStatus` | `PENDING`, `VERIFIED`, `FAILED` |
| `ReferralStatus` | `PENDING`, `VERIFIED`, `REJECTED` |
| `PromptType` · `PromptStage` | `APTITUDE`, `CODING`, `INTERVIEW` · `START`, `SUMMARY` |
| `JobStatusFilter` | `ACTIVE`, `EXPIRED`, `ALL` |
| `EmailType` | `APPLICATION_SUCCESS`, `ACKNOWLEDGEMENT`, `ACKNOWLEDGEMENT_CONFIRMATION`, `RECONFIRMATION`, `REJECTION`, `WRITTEN_TEST_SUCCESS`, `WRITTEN_TEST_FAILURE`, `SHORTLIST_NOTIFICATION`, `EXAM_SCHEDULE`, `INTERVIEW_SCHEDULE`, `OTP`, `PASSWORD_UPDATED`, `EXAM_SUBMISSION`, `CODING_EXAM_SUBMISSION`, `REGISTRATION_SUCCESS` |

Frontend mirrors live in `src/types/` — keep them in step when an enum changes.

## Where binary data lives

| Data | Storage |
| --- | --- |
| Profile image | MySQL `LONGBLOB` |
| Resume | MySQL `@Lob` + `contentType` |
| Answer key | MySQL `@Lob` |
| Question paper | MySQL `TEXT`, or object storage via `containerName`/`fileName` |
| Exam proctoring captures | Object storage, row keeps the reference |
| Interview video / screen recordings | S3, keys on the schedule |

---

# 09 — Security & RBAC

## Token model

| | Access token | Refresh token |
| --- | --- | --- |
| Form | Signed JWT, subject = email | Opaque random value, not a JWT |
| Lifetime | 10 minutes | 14 days |
| Storage | `localStorage` on the client | SHA-256 hash in the DB; raw value only in the cookie |
| Transport | `Authorization: Bearer` | httpOnly cookie `refresh_token`, path `/api`, `SameSite=Lax` |
| Validation | Issuer `arightpath.com`, audience `rightpath-web`, time claims, 60 s clock skew | Rotated on every use, linked by `replacedByTokenId` |
| On misuse | 401 → refresh | Reuse of a rotated token revokes the entire session chain |

If `rightpath.security.v2.jwt.secret` is empty the implementation falls back to
the legacy `jwt.token` secret. The design decision is recorded in the backend ADR
`docs/adr/0001-v2-auth-access-jwt-rotating-refresh.md`.

### What strict reuse detection forces on the client

Reuse detection is strict, so the client must never spend the cookie twice.
`api.service.ts` does three things about it:

1. **Persists the access token in `localStorage`.** Memory-only meant every page
   load started with nothing and had to spend a rotation; two reloads in quick
   succession presented the same refresh token twice and killed the session — the
   user was logged out for pressing F5. Persisting it means a reload reuses the
   token the tab already had. Sharing it across tabs (`localStorage`, not
   `sessionStorage`) means opening a second tab does not spend a rotation either.
2. **Single-flight refresh per tab.** One `refreshPromise`; every caller awaits
   it. Without this the startup bootstrap and the 401-retry path each ran their
   own refresh — and under React StrictMode the bootstrap ran twice by itself.
3. **A Web Locks lock (`rightpath_auth_refresh`) across tabs.** Locks are
   origin-wide, so two tabs waking together serialise instead of both spending
   the cookie. On browsers without Web Locks the per-tab guard still applies.

*Trade-off, stated plainly: the short-lived access token is readable by script on
this origin. The refresh cookie stays httpOnly.*

`setAccessToken` deliberately does **not** broadcast — silent rotation must not
signal other tabs, or the receiving tab's bootstrap → refresh → set path would
re-broadcast and loop. Genuine session transitions call
`broadcastAuthChange('login' | 'logout')` over a `BroadcastChannel`.

### Other credentials

Passwords use BCrypt with rules in `PasswordValidator` (`password.minsize` 8,
`password.maxsize` 20). Password reset is by email OTP, validated at
`/api/validate-otp`, then `/api/update-password`; OTPs expire and are purged
every 5 minutes.

## The security filter chain

One chain, `@Order(1)`, matching `/api/**`: CORS from `CorsConfig`, CSRF
disabled, sessions `STATELESS`, `OPTIONS /**` permitted so preflight passes, then
a public allowlist — `/api/login`, `/api/register`, `/api/refresh`,
`/api/logout`, `/api/compile/**`, `/api/job-applications/**`, `/api/mobile/**`,
`/api/generate-otp`, `/api/validate-otp`, `/api/update-password`. Everything else
is `authenticated()`. `ApiJwtAuthenticationFilter` runs before
`UsernamePasswordAuthenticationFilter`.

> **Note the breadth of `/api/job-applications/**`.** That whole prefix is
> allowlisted, so chain-level authentication does not apply to it. Its endpoints
> are protected only by their `@PreAuthorize` annotations — which they do all
> carry. It works, but the safety net is one layer thinner there; worth narrowing
> to just the genuinely public paths (`/apply`, `/acknowledge`).

## Authorization model

Roles and permissions live in the database and are enforced as Spring Security
authorities. Roles are exposed as `ROLE_<NAME>`; permissions as plain strings.
Method security uses **permissions**, never roles:
`@PreAuthorize("hasAuthority('JOB_POST_CREATE')")`.

`RbacAuthorityService.resolveAuthorities(email)` loads active rows from
`user_roles`, adds `ROLE_<NAME>` for each, and adds every permission attached to
those roles. Tables: `roles`, `permissions`, `role_permissions`, `user_roles`.

### Roles

| Role | Meaning |
| --- | --- |
| `SUPER_ADMIN` | Every permission |
| `ADMIN` | Everything except `USER_LIST`, `USER_ACTIVATE`, `USER_DEACTIVATE` |
| `USER` | Candidate — the limited set below |

### Permission matrix

| Permission | SUPER_ADMIN | ADMIN | USER |
| --- | :---: | :---: | :---: |
| `USER_READ` · `USER_UPDATE` | ✓ | ✓ | ✓ |
| `USER_LIST` · `USER_ACTIVATE` · `USER_DEACTIVATE` | ✓ | — | — |
| `RESUME_UPLOAD` · `RESUME_UPDATE` · `RESUME_VIEW` | ✓ | ✓ | ✓ |
| `RESUME_VIEW_ALL` | ✓ | ✓ | — |
| `ATS_UPLOAD_SINGLE` · `ATS_UPLOAD_MULTI` · `ATS_READ` | ✓ | ✓ | — |
| `ASSESSMENT_UPLOAD` · `ASSESSMENT_ASSIGN` · `ASSESSMENT_READ` | ✓ | ✓ | — |
| `ASSESSMENT_SUBMIT` · `ASSESSMENT_RESULT_SUBMIT` | ✓ | ✓ | ✓ |
| `QUESTION_GENERATE` · `CODING_QUESTION_GENERATE` · `QUESTION_WRITE` | ✓ | ✓ | — |
| `JOB_POST_CREATE` · `JOB_POST_UPDATE` · `JOB_POST_DELETE` · `JOB_WRITE` | ✓ | ✓ | — |
| `JOB_POST_READ` · `JOB_APPLY` | ✓ | ✓ | ✓ |
| `JOB_APPLICATION_READ_ALL` | ✓ | ✓ | — |
| `INTERVIEW_ASSIGN` · `INTERVIEW_WRITE` | ✓ | ✓ | — |
| `INTERVIEW_START` · `INTERVIEW_ANSWER` | ✓ | ✓ | ✓ |
| `COMPILER_RUN` · `COMPILER_RESULTS_READ` | ✓ | ✓ | ✓ |

`RbacSeedConfig` seeds this on every boot, idempotently. `SUPER_ADMIN` is only
refreshed if the row already exists — some deployments have a `roles.name` column
too small to hold the string, and creating it would fail startup.

Roles are managed at runtime through `/api/admin/rbac/{assign-role, remove-role}`.

### Frontend RBAC

`ProtectedRoute` guards route trees by role; `RoleGate` and `PermissionGate` hide
UI; `useRbac()` exposes the predicates. Roles and permissions come from the access
token / `/api/me` and are held in `AuthContext`. **Client checks are UX only** —
every one is re-enforced by `@PreAuthorize` on the server.

> **Known drift:** `src/config/permissions.ts` is not the backend enum. It
> invents `USER_WRITE`, `USER_DELETE`, `ASSESSMENT_WRITE`, `JOB_READ`,
> `ATS_WRITE`, `INTERVIEW_READ`, `QUESTION_READ`, `RESULT_READ`,
> `RESULT_WRITE`, `PROMPT_READ`, `PROMPT_WRITE`, none of which exist
> server-side, and omits most of the real ones. A `PermissionGate` keyed to an
> invented name can never open.

## Exam and interview integrity

Assessment security is behavioural as much as authorization: lockdown layouts
with no navigation, fullscreen enforcement, tab-switch counting, face detection,
devtools detection, noise checks, identity photo, optional room scan, and
auto-submit on limits.

WebSocket sessions are authenticated at handshake by `WebSocketAuthInterceptor`,
and every `@MessageMapping` re-verifies that the `scheduleId` in the destination
belongs to the authenticated email. Audio chunks are capped at 200 KB and answers
deduplicated by transcript hash for 60 s.

## Operational notes

- `cookie-secure: false` in all four shipped profiles. Any HTTPS deployment
  should set it `true`.
- Secrets are committed as YAML defaults behind `${ENV_VAR:...}` fallbacks.
  Supply the environment variables and treat the committed values as compromised.
- `ddl-auto=update` in production means Hibernate can alter the live schema.
- Actuator exposes only `health` and `info`.

---

# 10 — Environments & Deployment

## Profiles

| Profile | Port | Database | API host | FE env file |
| --- | ---: | --- | --- | --- |
| `dev` | 8081 | local MySQL `Rightpath` | `http://localhost:8082` | `.env.development` |
| `stage` | 8082 | RDS `rightpath_stage` (`ai-rightpath-db-dev`) | `https://devapi.airightpath.com` | `.env.staging` |
| `uat` | 8083 | RDS `Rightpath-uat` (`ai-rightpath-db-uat`) | `https://api-uat.airightpath.com` | — |
| `prod` | 8081 | RDS `Rightpath-dev` (`ai-rightpath-db-dev`) | `https://api.airightpath.com` | `.env.production` |

Activate with `--spring.profiles.active=<profile>`; `dev` is the default.

> **Two things to watch.** `prod` points at a database named `Rightpath-dev` on
> the `-db-dev` RDS instance, shared with `stage`. And `.env.development` sets
> `VITE_API_BASE_URL` to `:8081` while `VITE_WS_URL` points at `:8082` — set both
> explicitly for whichever backend you run locally.

## Backend configuration

`application.properties` holds what is true everywhere: the active profile, the
correlation-id log pattern, and `app.mail.*` (sender name, company, support
email, website, address, candidate portal URL, on-site test venue) which every
email template reads from, so branding changes once rather than per template.

| Area | Keys |
| --- | --- |
| Server | `server.port`, Tomcat max 200 / min-spare 10 threads, 100 MB form post, 64 KB headers, gzip over 1 KB |
| Datasource | `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` |
| JPA | `ddl-auto: update` on **every** profile; `show-sql` in dev only |
| Mail | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`; STARTTLS on |
| Upload | `max-file-size` / `max-request-size` = 500 MB |
| Password rules | `password.minsize` 8, `password.maxsize` 20 |
| Auth v2 | `rightpath.security.v2.jwt.{secret,issuer,audience,access-ttl-minutes,clock-skew-seconds}`, `...refresh.{ttl-days,cookie-name,cookie-secure,cookie-samesite,cookie-path}` |
| OpenAI | `OPENAI_API_KEY`, `openai.model` `gpt-4o`, `openai.audio.model` `whisper-1`, `openai.tts.model` `tts-1-hd`, voice `nova`, question timeout 300 s |
| AWS S3 | `AWS_S3_BUCKET`, region `ap-south-1`, access and secret keys |
| Twilio | `TWILIO_SID`, auth token, from number |
| ATS | `ats.screening.threshold` = `60.0` |
| Interview | `max-duration-minutes` 60, `max-warnings` 5, `context-window-size` 4 |
| Early termination | `min-questions` 4, `skip-ratio-threshold` 0.5, `min-avg-word-count` 15, `min-confidence-score` 30.0, `consecutive-skip-threshold` 2, `consecutive-short-answer-threshold` 3 |
| Questions | `questions.additional.count` 100 |
| Terminal | `terminal.execution.timeout-seconds` 120, `max-sessions-per-user` 5 |
| Compiler | `compiler.*` — code defaults, absent from the YAMLs (see section 03) |
| CORS | `APP_CORS_ALLOWED_ORIGINS`, `APP_BASE_URL` |
| Actuator · Swagger | exposes `health,info` · UI `/swagger-ui.html`, spec `/v3/api-docs` |

### Secrets

Every secret is present in the committed YAMLs as a literal default behind a
`${ENV_VAR:default}` placeholder — database password, JWT secret, OpenAI key,
AWS access/secret keys, Twilio token, mail password. In any real deployment:

1. Supply the environment variables so the defaults are never used.
2. Treat the committed values as compromised and rotate them.
3. Set `rightpath.security.v2.refresh.cookie-secure=true` for HTTPS.

## Frontend configuration

Only `VITE_`-prefixed variables reach the browser — never put a secret in them.

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | API origin (code default `http://localhost:8081`) |
| `VITE_WS_URL`, `VITE_WS_BASE_URL` | WebSocket origin |
| `VITE_LOCAL_IP` | LAN IP for testing the mobile flow against a local backend |
| `VITE_CODING_TESTCASE_VISIBILITY` | `locked` / `open` / `partial` |
| `VITE_CODING_TESTCASE_OPEN_COUNT`, `_OPEN_RATIO` | `partial` tuning |
| `VITE_PROCTORING_CAMERA_REQUIRED` | Block the exam without camera access |
| `VITE_PROCTORING_FULLSCREEN_ENABLED` | Require and re-prompt for fullscreen |
| `VITE_PROCTORING_TAB_SWITCH_ENABLED`, `_MAX_TAB_SWITCHES` | Tab-switch policy (0 = warn only) |
| `VITE_PROCTORING_EYE_DETECTION_ENABLED`, `_MAX_EYE_WARNINGS`, `_EYE_CHECK_INTERVAL_MS` | Face-check policy |
| `VITE_PROCTORING_NOISE_*` | `ENABLED`, `WARN_DB`, `BLOCK_DB`, `SUSTAIN_MS`, `BLOCKS_START` |
| `VITE_PROCTORING_PHOTO_REQUIRED`, `_PHOTO_MAX_WIDTH` | Identity photo |
| `VITE_PROCTORING_ROOM_SCAN_REQUIRED`, `_FRAMES`, `_DURATION_MS` | Room scan |

**How the environments actually differ** — dev is lenient, staging and production
are strict. Everything else is identical across the three.

| Setting | dev | staging | production |
| --- | ---: | ---: | ---: |
| `MAX_TAB_SWITCHES` | 5 | 1 | 1 |
| `MAX_EYE_WARNINGS` | 5 | 0 (warn only) | 0 (warn only) |
| `EYE_CHECK_INTERVAL_MS` | 4000 | 5000 | 5000 |
| `ROOM_SCAN_FRAMES` | 8 | 12 | 12 |

Vite inlines `VITE_*` at build time, so **the API URL is baked into the image**.
One image per environment, built with that environment's `.env` file.

## Running locally

```bash
# Backend — needs MySQL plus javac/java, python3, node, gcc, g++ on PATH
cd Backend/airightpath-be
./mvnw spring-boot:run                 # dev profile, :8081
./mvnw clean package -DskipTests       # -> target/rightpath.jar
docker compose up --build              # or: app + MySQL 8 (app 8081, MySQL 3307)

# Frontend
cd Frontend/airightpath-fe
npm ci
npm run dev                            # :5173, /api proxied to :8081
npm run typecheck && npm run lint
npm run build                          # -> dist/
```

The dev server binds `0.0.0.0` so a phone on the same LAN can reach it — that is
what makes the mobile room-scan flow testable locally via `VITE_LOCAL_IP`.

## Docker images

**Backend** — `eclipse-temurin:21-jdk-jammy` plus `python3`, `build-essential`
(needed for gcc/g++ to link) and Node 22. The build then runs a version check on
every toolchain, so a broken image fails in CI rather than mid-exam on a
candidate's submission. Copies `target/rightpath.jar` and runs it.
`EXPOSE 8081 8082 8083` is documentation — one image serves every environment and
the port comes from the active profile. Also present:
`Dockerfile-multi-combined`, `Dockerfile-multi-combined-aws.dockerfile`, and
`deployment.yaml` for Kubernetes.

**Frontend** — multi-stage: `node:22-bullseye-slim` runs `npm ci` and
`npm run build`, then `nginx:alpine` serves `dist/` on port 80 with
`try_files $uri /index.html` so client-side routes resolve on a hard refresh.

## Deployment checklist

1. Set every secret through environment variables; do not rely on committed
   defaults.
2. Set `cookie-secure=true` and confirm `SameSite` suits your domain layout.
3. Add the frontend origin to `APP_CORS_ALLOWED_ORIGINS` — it also gates the
   WebSocket handshake, so a missing origin breaks interviews, not just REST.
4. Confirm the backend image carries all five language toolchains.
5. Confirm S3 bucket, region and credentials — recordings and captures fail
   silently at the wrong layer otherwise.
6. Build the frontend with the matching `.env` file.
7. Verify `/actuator/health` and `/swagger-ui.html` (disable Swagger where the
   environment should not expose it).
8. Review `ddl-auto` — it is `update` in prod, so Hibernate can alter the live
   schema on boot.

---

# 11 — Status & Gaps

Read from the code on branch `staging` as of 2026-08-29, not from a plan.

- **Complete** — exists end to end on both sides and is wired into the UI.
- **Partial** — works, with a caveat.
- **Gap** — referenced but missing, or drifting.

## Headline

**Both L1 and L2 are functionally complete end to end** — job post through exam
result, and scheduling through interview evaluation. What is thin is verification
and hygiene, not features.

## L1 — Assessment

| Capability | Status | Note |
| --- | --- | --- |
| Job posting, update, delete | Complete | Client comments still call update/delete "pending backend delivery" — stale |
| Shareable per-job apply link | Complete | `applyJobUrl(jobPrefix)` |
| Application + resume upload | Complete | PDF/DOC/DOCX, 2 MB |
| Referral capture and verification | Complete | `ReferralStatus`, admin `PATCH /referral-status` |
| ATS screening — single and batch | Complete | TF-IDF + skills + experience + education, threshold 60.0 |
| Scoped screening by email list | Complete | Replaces the deprecated `filterByPrefix` |
| Manual shortlisting with override | Complete | `PATCH /shortlist` |
| Candidate mail suite | Complete | Six templates, branding centralised in `app.mail.*` |
| AI question generation — aptitude and coding | Complete | Prompt-driven per job |
| Question paper upload | Complete | Plus client-side question counting |
| Assessment assignment | Complete | Per-candidate rows, window, timing, pass mark |
| Assignment survives a mail outage | Complete | `AssignmentReportDTO`; covered by test |
| Exam rescheduling | Complete | `notify` defaults true |
| Automatic expiry | Complete | Per-minute bulk update + hourly sweep |
| Pre-exam checks | Complete | All six, env-switchable |
| Identity photo + room scan capture | Complete | Object storage, admin-viewable |
| Aptitude exam | Complete | Proctored, timed, auto-submit, both option formats normalised |
| Coding exam | Complete | Monaco, 5 languages, test cases, configurable visibility |
| Server-side code execution | Complete | Compile-once, typed statuses, 503 when a toolchain is missing |
| Proctoring during the exam | Complete | Fullscreen, tab switches, face, devtools, reload guard |
| Auto-submit on violation/timeout | Complete | Reason and timing in `__submissionMeta` |
| Grading | Complete | Percentage vs the paper's `passPercentage` |
| Result views — admin + candidate | Complete | Shared maths so both quote identical numbers |
| Multiple attempts per module | Complete | Attempts kept, latest surfaced |
| Excel export | Complete | Typed cells, plus a final summary sheet |
| PDF answer sheets / paper export | Complete | jsPDF |

## L2 — Interview

| Capability | Status | Note |
| --- | --- | --- |
| Evaluation categories with weights | Complete | Per job, drives the score |
| Per-job interview prompts | Complete | Stages `START` / `SUMMARY` |
| Interview question upload / generation | Complete | Per job and per category |
| Scheduling — single and bulk | Complete | Window, mail, status transition |
| Candidate interview list and entry | Complete | Pre-start screen, countdown, permissions |
| Mobile pairing + WebRTC room scan | Complete | QR pairing, offer/answer/ICE over STOMP |
| AI room verification | Complete | `gpt-4o` vision, `RoomVerificationSession` |
| Voice interview — 6 phases | Complete | Adaptive difficulty 1–5, phase budgets |
| Streaming AI responses + TTS | Complete | With browser fallback topic |
| Live transcription | Complete | `whisper-1` on a dedicated pool |
| Filler audio while the model thinks | Complete | `/topic/interview/{id}/filler` |
| Barge-in / interrupt | Complete | |
| Coding questions inside the interview | Complete | Editor + `codeContent`/`codeLanguage` |
| Interview proctoring | Complete | Events persisted, warning count, escalation |
| Video + screen recording | Complete | Chunked upload to S3 |
| Early termination on poor performance | Complete | Six tunable heuristics |
| Server-side timeout enforcement | Complete | 5-minute sweep of stale `IN_PROGRESS` |
| Resume after disconnect | Complete | `GET /voice/{id}/resume` |
| Weighted evaluation + speech metrics | Complete | Categories, WPM, fillers, confidence |
| PDF interview report | Complete | `PdfReportGenerator` |
| Admin results, stats, transcript, events | Complete | All under `INTERVIEW_ASSIGN` |

## Platform

| Capability | Status | Note |
| --- | --- | --- |
| Registration, login, logout | Complete | Atomicity covered by test |
| Access + rotating refresh tokens | Complete | Hashed storage, reuse detection, session revocation |
| Cross-tab session handling | Complete | Single-flight refresh + Web Locks + BroadcastChannel |
| OTP password reset, change password | Complete | Mail-delivered, auto-purged |
| RBAC — DB-backed, seeded | Complete | Method-level `@PreAuthorize` throughout |
| Runtime role assignment | Complete | `/api/admin/rbac/*` |
| User list, activate/deactivate | Complete | `SUPER_ADMIN` only |
| Profile + avatar, theme, toasts, error boundary | Complete | |
| Correlation-id logging | Complete | On every log line |
| OpenAPI/Swagger, health endpoint | Complete | Per-profile toggle |
| Docker images — FE + BE | Complete | Toolchains verified at build time |

## Partial

| Item | Detail |
| --- | --- |
| Backend test coverage | 22 test classes, concentrated on job posts, assessment timing, scheduling validation, code execution, error classification, proctoring upload binding, email rendering, status transitions. Interview/voice, ATS scoring and the auth token flow have no direct tests |
| Frontend test coverage | None. No test runner in `package.json`; the gates are `npm run typecheck` and `npm run lint` |
| Schema migrations | `ddl-auto=update` on every profile including prod. Changes documented by hand in `backend/docs/migrations/`, no Flyway/Liquibase |
| Azure Blob storage | `AzureBlobStorageService` exists alongside `S3StorageService`; S3 is what the profiles configure |
| AWS Rekognition | On the classpath; shipped face checks are `gpt-4o` vision and client-side face-api.js |
| WhatsApp / Twilio | Works but is not part of the candidate journey; dev credentials are placeholders |
| Terminal WebSocket | `/ws/terminal` wired with config (120 s execution, 5 sessions/user); no UI drives it |
| `CompileController` | `POST /api/compile` is public and duplicates part of `/api/compiler/run` |
| React Query | A dependency, but most screens call services directly — caching is inconsistent |

## Gaps and drift

| # | Finding | Impact |
| ---: | --- | --- |
| 1 | `COMPILER.SAVE_UNATTEMPTED` points at `/api/compiler/save-unattempted`; the backend mapping is `saveUnattemptedSubmissions` and expects a `List<CodeSubmissionRequestDTO>`, not `{ assessmentId, candidateEmail }` | Latent — the method is never called. Fix before wiring it into the exam |
| 2 | `RESUME.UPLOAD_MULTIPLE` points at `/api/upload-resumes`, which has no backend mapping (the real route is `/api/upload-multiple-resumes`) | Latent — unused; the batch screen uses the correct path |
| 3 | `ATS.SCREEN_SINGLE` points at `/api/ats/screen`; no `/api/ats` controller exists (the single route is `/api/upload-single-resumes`) | Latent — unused |
| 4 | `src/config/permissions.ts` does not match `PermissionName` — it invents 11 names and omits most real ones | A `PermissionGate` keyed to an invented name can never open. Regenerate from the enum |
| 5 | Stale "pending backend delivery" comments for job update and delete; `job.service.ts` still carries `isEndpointMissing` fallbacks | Both shipped; the fallback paths are dead |
| 6 | `/api/job-applications/**` allowlisted as a whole prefix | Access control holds via annotations, but the chain-level net is missing |
| 7 | `cookie-secure: false` in every profile, including prod | Refresh cookie can travel over plain HTTP |
| 8 | Secrets committed as YAML defaults — DB, JWT, OpenAI, AWS, Twilio, mail | Override via env and rotate |
| 9 | Prod points at a dev-named database on the dev RDS instance, shared with stage | Blast radius across environments |
| 10 | `.env.development` mixes ports — API `:8081`, WS `:8082` | Local interview flow silently fails |
| 11 | `README.md` is still the Azure DevOps template; `RIGHTPATH_DOCUMENTATION.md` describes roles that do not exist in code (`HR`, `Interviewer`) and a Supabase-era schema | Misleads new joiners |

## Recommended next steps

| Theme | Action |
| --- | --- |
| Correctness | Fix gaps 1–5. Each is small and removes a latent bug or a misleading comment |
| Security | Close gaps 6–8 before any production hardening review |
| Confidence | Add tests where the money is — interview evaluation scoring, ATS scoring, and the refresh-token rotation/reuse path. Add Vitest and start with `result.utils.ts`, `exam-duration.utils.ts` and `results-export.utils.ts`, which are pure and carry the grading maths |
| Operability | Introduce Flyway before the schema drifts further from what `ddl-auto=update` produced |

---

## Maintaining this document

| If you changed… | Update section |
| --- | --- |
| A REST endpoint or WS destination | 07 — and `src/config/api.endpoints.ts` on the client |
| An entity, column or enum | 08 |
| A permission, role or auth rule | 09 |
| Exam, proctoring or grading behaviour | 05 |
| Interview behaviour, prompts or evaluation | 06 |
| A config key, profile or env var | 10 |
| A feature shipped, or a gap closed | 11 |
| Backend package or service layout | 03 |
| Frontend folders, routes or contexts | 04 |

When you close a gap in section 11, delete its row rather than marking it done —
that list is meant to stay short and current.

Conventions: backend paths are relative to the backend repo root
(`src/main/java/...`), frontend paths to this repo root (`src/...`). Config values
quoted are `dev` profile defaults unless stated. Anything asserted here was read
out of the code; where a passage describes intent rather than shipped behaviour
it says so.
