# 09 — Environments & Deployment

## Environments

| Profile | Port | Database | API host | Frontend env file |
| --- | --- | --- | --- | --- |
| `dev` | 8081 | local MySQL `Rightpath` | `http://localhost:8082` (`app.base.url`) | `.env.development` |
| `stage` | 8082 | RDS `rightpath_stage` (`ai-rightpath-db-dev`) | `https://devapi.airightpath.com` | `.env.staging` |
| `uat` | 8083 | RDS `Rightpath-uat` (`ai-rightpath-db-uat`) | `https://api-uat.airightpath.com` | — |
| `prod` | 8081 | RDS `Rightpath-dev` (`ai-rightpath-db-dev`) | `https://api.airightpath.com` | `.env.production` |

Activate with `--spring.profiles.active=<profile>`; `dev` is the default in
`application.properties`.

> Two things to be aware of in the shipped config: `prod` points at a database
> named `Rightpath-dev` on the `-db-dev` RDS instance and shares that instance
> with `stage`, and `.env.development` sets `VITE_API_BASE_URL` to `:8081` while
> `VITE_WS_URL` points at `:8082`. Set both explicitly for whichever backend you
> are running locally.

## Backend configuration

`application.properties` holds what is true everywhere:

- `spring.profiles.active=dev`
- `logging.pattern.level=%5p [%X{requestId:-}]` — the correlation id set by
  `RequestResponseLoggingFilter` on every log line
- `app.mail.*` — sender name, company name, support email, website, company
  address, candidate portal URL, on-site test venue. Every email template reads
  from here, so branding changes once rather than per template.

`application-<profile>.yml` holds the environment specifics.

### Keys by area

| Area | Keys |
| --- | --- |
| Server | `server.port`, Tomcat threads (max 200 / min-spare 10), `max-http-form-post-size` 100 MB, `max-http-header-size` 64 KB, gzip on for JSON/text over 1 KB |
| Datasource | `spring.datasource.url/username/password` — `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` |
| JPA | `ddl-auto: update` on **every** profile; `show-sql` true in dev only |
| Mail | `spring.mail.host/port/username/password` — `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`; STARTTLS on |
| Upload | `spring.servlet.multipart.max-file-size` / `max-request-size` = 500 MB |
| Password rules | `password.minsize` 8, `password.maxsize` 20 |
| Auth v2 | `rightpath.security.v2.jwt.{secret,issuer,audience,access-ttl-minutes,clock-skew-seconds}`, `…refresh.{ttl-days,cookie-name,cookie-secure,cookie-samesite,cookie-path}` |
| Legacy JWT | `jwt.token` — fallback when the v2 secret is empty |
| OpenAI | `openai.api.key` (`OPENAI_API_KEY`), `openai.api.base-url`, `openai.model` `gpt-4o`, `openai.audio.model` `whisper-1`, `openai.tts.model` `tts-1-hd`, `openai.tts.voice` `nova`, `openai.question.timeout-seconds` 300 |
| AWS S3 | `aws.s3.bucket-name` (`AWS_S3_BUCKET`), `aws.s3.region` `ap-south-1`, `access-key`, `secret-key` |
| Twilio | `twilio.account.sid` (`TWILIO_SID`), `twilio.auth.token`, `twilio.from.number` |
| ATS | `ats.screening.threshold` = `60.0` |
| Interview | `interview.max-duration-minutes` 60, `interview.max-warnings` 5, `interview.context-window-size` 4 |
| Early termination | `interview.early-termination.{min-questions:4, skip-ratio-threshold:0.5, min-avg-word-count:15, min-confidence-score:30.0, consecutive-skip-threshold:2, consecutive-short-answer-threshold:3}` |
| Questions | `questions.additional.count` 100 |
| Terminal | `terminal.execution.timeout-seconds` 120, `terminal.max-sessions-per-user` 5 |
| Compiler | `compiler.*` — see the table in [02-backend-architecture.md](02-backend-architecture.md); all have code defaults and are absent from the YAMLs |
| CORS | `app.cors.allowed-origins` (`APP_CORS_ALLOWED_ORIGINS`), `app.base.url` (`APP_BASE_URL`) |
| Actuator | exposes `health,info` only |
| Swagger | `springdoc.*` — UI at `/swagger-ui.html`, spec at `/v3/api-docs` |

### Secrets

Every secret is present in the committed YAMLs as a literal default behind a
`${ENV_VAR:default}` placeholder — database password, JWT secret, OpenAI key,
AWS access/secret keys, Twilio token, mail password. In any real deployment:

1. Supply the environment variables so the defaults are never used.
2. Treat the committed values as compromised and rotate them.
3. Set `rightpath.security.v2.refresh.cookie-secure=true` for HTTPS (all four
   profiles currently ship `false`).

## Frontend configuration

Only `VITE_`-prefixed variables reach the browser — never put a secret in them.
Every value is optional; code defaults live in
[`src/config/`](../src/config/).

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | API origin (code default `http://localhost:8081`) |
| `VITE_WS_URL`, `VITE_WS_BASE_URL` | WebSocket origin |
| `VITE_LOCAL_IP` | LAN IP for testing the mobile flow against a local backend |
| `VITE_CODING_TESTCASE_VISIBILITY` | `locked` / `open` / `partial` |
| `VITE_CODING_TESTCASE_OPEN_COUNT`, `VITE_CODING_TESTCASE_OPEN_RATIO` | `partial` tuning |
| `VITE_PROCTORING_CAMERA_REQUIRED` | Block the exam without camera access |
| `VITE_PROCTORING_FULLSCREEN_ENABLED` | Require and re-prompt for fullscreen |
| `VITE_PROCTORING_TAB_SWITCH_ENABLED`, `VITE_PROCTORING_MAX_TAB_SWITCHES` | Tab-switch policy (0 = warn only) |
| `VITE_PROCTORING_EYE_DETECTION_ENABLED`, `VITE_PROCTORING_MAX_EYE_WARNINGS`, `VITE_PROCTORING_EYE_CHECK_INTERVAL_MS` | Face-check policy |
| `VITE_PROCTORING_NOISE_*` | `ENABLED`, `WARN_DB`, `BLOCK_DB`, `SUSTAIN_MS`, `BLOCKS_START` |
| `VITE_PROCTORING_PHOTO_REQUIRED`, `VITE_PROCTORING_PHOTO_MAX_WIDTH` | Identity photo |
| `VITE_PROCTORING_ROOM_SCAN_REQUIRED`, `_FRAMES`, `_DURATION_MS` | Room scan |

**How the environments actually differ** — dev is lenient, staging and
production are strict:

| Setting | dev | staging | production |
| --- | --- | --- | --- |
| `MAX_TAB_SWITCHES` | 5 | 1 | 1 |
| `MAX_EYE_WARNINGS` | 5 | 0 (warn only) | 0 (warn only) |
| `EYE_CHECK_INTERVAL_MS` | 4000 | 5000 | 5000 |
| `ROOM_SCAN_FRAMES` | 8 | 12 | 12 |

Everything else (camera, fullscreen, noise, photo, room scan required,
`partial` test-case visibility) is identical across the three.

## Running locally

**Backend**

```bash
cd Backend/airightpath-be
./mvnw spring-boot:run                       # dev profile, :8081
./mvnw clean package -DskipTests             # -> target/rightpath.jar
```

Needs MySQL reachable (`createDatabaseIfNotExist=true` handles the database
itself) plus `javac`/`java`, `python3`, `node`, `gcc`, `g++` on `PATH` for the
coding exam.

Or with Docker Compose (app + MySQL 8, app on 8081, MySQL on 3307):

```bash
docker compose up --build
```

**Frontend**

```bash
cd Frontend/airightpath-fe
npm ci
npm run dev          # http://localhost:5173, /api proxied to :8081
npm run typecheck
npm run lint
npm run build        # -> dist/
```

The dev server binds `0.0.0.0` so a phone on the same LAN can reach it — that is
what makes the mobile room-scan flow testable locally via `VITE_LOCAL_IP`.

## Docker images

**Backend** — `eclipse-temurin:21-jdk-jammy` plus `python3`, `build-essential`
(needed for gcc/g++ to link) and Node 22. The build then runs
`java -version && javac -version && python3 --version && node --version &&
gcc --version && g++ --version`, so a broken image fails in CI rather than
mid-exam on a candidate's submission. Copies `target/rightpath.jar` and runs it.
`EXPOSE 8081 8082 8083` is documentation — one image serves every environment
and the port comes from the active profile.

There are also `Dockerfile-multi-combined` and
`Dockerfile-multi-combined-aws.dockerfile` for combined builds, plus
`deployment.yaml` for Kubernetes.

**Frontend** — multi-stage: `node:22-bullseye-slim` runs `npm ci` and
`npm run build`, then `nginx:alpine` serves `dist/` on port 80 with
`nginx.conf` doing `try_files $uri /index.html` so client-side routes resolve on
a hard refresh.

```bash
docker build -t airightpath-fe .
docker run -p 80:80 airightpath-fe
```

Vite inlines `VITE_*` at build time, so **the API URL is baked into the image**.
One image per environment, built with that environment's `.env` file.

## Deployment checklist

1. Set every secret through environment variables; do not rely on the committed
   defaults.
2. `cookie-secure=true` and confirm `SameSite` suits your domain layout.
3. Add the frontend origin to `APP_CORS_ALLOWED_ORIGINS` — it also gates the
   WebSocket handshake, so a missing origin breaks interviews, not just REST.
4. Confirm the backend image has all five language toolchains (the build check
   covers this).
5. Confirm S3 bucket, region and credentials — recordings and captures fail
   silently at the wrong layer otherwise.
6. Build the frontend with the matching `.env` file.
7. Verify `/actuator/health` and `/swagger-ui.html` (disable Swagger if the
   environment should not expose it).
8. Review `ddl-auto` — it is `update` in prod, so Hibernate can alter the live
   schema on boot.
