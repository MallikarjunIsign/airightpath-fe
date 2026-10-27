# 02 — Backend Architecture

Spring Boot 3.4 on Java 21, package root `com.rightpath`. Classic layered
design: controllers hold no business logic, services are interface + `impl`
pairs, repositories are Spring Data.

## Package map

| Package | Contents |
| --- | --- |
| `config` | Security, CORS, WebSocket, async pools, OpenAI client, OpenAPI, RBAC seeding |
| `controller` | 20 classes — REST controllers plus two STOMP message controllers |
| `dto` | Request/response types; `dto/voice` holds the interview payloads |
| `entity` | 26 JPA entities |
| `enums` | 17 domain enums (see [07-data-model.md](07-data-model.md)) |
| `error`, `exceptions` | Error envelope, custom exceptions, `@ControllerAdvice` handlers |
| `filter` | `ApiJwtAuthenticationFilter`, `RequestResponseLoggingFilter` |
| `rbac` | `RoleName`, `PermissionName` — the canonical authority names |
| `repository` | Spring Data interfaces + `JobPostSpecifications` |
| `service` | Interfaces (33) |
| `service/impl` | Implementations (32) |
| `service/rbac` | `RbacAdminService`, `RbacAuthorityService` |
| `util` | PDF report generation, prompt placeholders, token hashing, business schedule, synonyms |
| `validator` | `PasswordValidator` |
| `websocket` | `WebSocketAuthInterceptor`, `VoiceInterviewSocketHandler`, `TerminalSocketHandler` |

## Controllers

| Controller | Base path | Level | Responsibility |
| --- | --- | --- | --- |
| `AuthenthicationController` | `/api` | — | Register, login, refresh, logout, `/me`, OTP, password, profile, user list |
| `RbacAdminController` | `/api/admin/rbac` | — | Assign/remove roles, inspect a user's roles and the role catalogue |
| `JobPostController` | `/api/jobs` | L1 | Create, update, delete, list jobs; counts; job types |
| `JobApplicationForCandidateController` | `/api/job-applications` | L1 | Apply, update, list, screen, shortlist, referral status, every candidate mail, exam link, interview scheduling trigger |
| `ResumeController` | `/api` | L1 | Upload, update and view a candidate's resume |
| `ATSController` | `/api` | L1 | Single and bulk resume screening |
| `QuestionController` | `/api` | L1 | Generate aptitude and coding questions from the job description |
| `AssessmentController` | `/api` | L1 | Upload papers, assign, fetch, submit, record results, reschedule, blob storage, hourly expiry job |
| `CompilerController` | `/api/compiler` | L1 | Run code, save unattempted submissions, read code results |
| `CompileController` | `/api/compile` | L1 | Public lightweight compile endpoint |
| `ExamProctoringController` | `/api/exam-proctoring` | L1 | Identity photo, room scan frames, capture reads |
| `InterviewController` | `/api/interview` | L2 | Assign, list, start, answer, voice lifecycle, recordings, proctoring events, stats, question upload, room verification |
| `VoiceInterviewWebSocketController` | STOMP | L2 | Audio chunks, answer submission, interrupt, proctoring events |
| `MobileWebSocketController` | STOMP | L2 | Desktop/mobile pairing and WebRTC signalling for the room scan |
| `MobileVerificationController` | `/api/mobile` | L2 | Room verification and monitoring from the phone |
| `JobPromptController` | `/api/prompts` | L1+L2 | Per-job prompts and interview evaluation categories |
| `HeaderCountController` | — | — | Header badge counts |
| `HealthController` | — | — | `/actuator/health` passthrough |
| `WhatsAppController` | `/whatsapp` | — | Twilio message send |
| `ErrorPageController` | — | — | Invalid-request error page |

## Services by concern

### Identity and access
`LoginService`, `UserDetailsServiceImpl`, `JwtService`, `AccessTokenService`,
`RefreshTokenService`, `TokenFacade`, `AuthoritiesService`, `OtpService`,
`RbacAdminService`, `RbacAuthorityService`.

### L1 — application and screening
`JobPostServiceImpl`, `JobApplicationForCandidateServiceImpl`, `ResumeServiceImpl`,
`ATSServiceImpl`.

`ATSServiceImpl` is deterministic, not an LLM. It extracts resume text with
Tika, tokenises after stripping stopwords, then combines weighted sub-scores:

- TF-IDF cosine similarity between resume and job description
- Skill match (with `synonyms.json` expansion)
- Years-of-experience match, parsed out of the resume text
- Education match, from extracted degrees and passing years

The result is clamped to 0–100 and compared against
`ats.screening.threshold` (default `60.0`). It also extracts the candidate's
email from the resume so a bulk upload can attach scores to people.

### L1 — assessments and grading
`AssessmentServiceImpl` (assign, fetch, submit, record result, reschedule,
expire), `OpenAiServiceImpl` (question generation), `CompileService` /
`CompilerServiceDiffL` / `LocalCompileService`, `CodeExecutionEngine`,
`ErrorClassifier`, `ExamProctoringServiceImpl`.

`CodeExecutionEngine` is the core of coding assessment:

- Compiles once and reuses the artifact for every test case; Java compiles
  in-process where the JDK allows, avoiding a second JVM start.
- Python and JavaScript get an up-front syntax check, so a syntax error is
  reported as one rather than as N identical crashes.
- Every candidate-code failure — compile error, crash, infinite loop, runaway
  output, wrong answer — is a normal result carrying an `ExecutionStatus`.
  Exceptions are reserved for the platform failing (missing toolchain,
  unreadable working directory) and answer `503 COMPILER_UNAVAILABLE`.
- Test cases run in parallel up to `compiler.max-parallel-runs`.

Tunables (all `@Value` with these defaults; add them under a `compiler:` block
in the profile yml to override):

| Key | Default | Meaning |
| --- | --- | --- |
| `compiler.compile-timeout-seconds` | 20 | Compile step deadline |
| `compiler.run-timeout-seconds` | 5 | One test case |
| `compiler.total-timeout-seconds` | 45 | Compile plus every run |
| `compiler.max-output-bytes` | 65536 | Captured output per run |
| `compiler.max-script-length` | 200000 | Rejects oversized pastes before compiling |
| `compiler.max-parallel-runs` | 4 | Concurrent test-case runs |
| `compiler.command.{python,node,gcc,gpp,javac,java}` | `python3`, `node`, `gcc`, `g++`, `javac`, `java` | Toolchain binaries |

### L2 — interview
`InterviewServiceImpl`, `VoiceInterviewServiceImpl`, `MainInterviewAiServiceImpl`,
`InterviewContextService`, `InterviewQuestionsServiceImpl`,
`InterviewEvaluationService`, `InterviewReportServiceImpl`,
`CandidatePerformanceAnalyzer`, `ToneAnalysisService`,
`SpeechToTextServiceImpl`, `TextToSpeechService`, `AudioTranscriptionService`,
`OpenAiStreamingService`, `OpenAiVisionServiceImpl`,
`RoomVerificationServiceImpl`, `AiRoomVerificationServiceImpl`,
`MobileConnectionServiceImpl`.

Behaviour is documented in [05-l2-interview-flow.md](05-l2-interview-flow.md)
and, in more depth, in
[AI-Interview-Technical-Flow.md](AI-Interview-Technical-Flow.md).

### Shared infrastructure
`EmailServiceImpl` + `EmailAsyncService` (Thymeleaf templates, one per
`EmailType`), `S3StorageService` and `AzureBlobStorageService` behind
`StorageService`, `WhatsAppService`, `JobPromptServiceImpl`.

## Async and scheduling

`AsyncConfig` defines two named pools:

| Bean | Core / Max | Thread prefix | Used for |
| --- | --- | --- | --- |
| `transcriptionExecutor` | 4 / 8 | `transcription-` | Whisper speech-to-text |
| `ttsExecutor` | 2 / 4 | `tts-` | Text-to-speech synthesis |

Scheduled jobs:

| Schedule | Where | What |
| --- | --- | --- |
| `0 0 * * * *` (hourly) | `AssessmentController.scheduleExpireAssessments` | Calls `expireAssessments()` |
| `0 * * * * *` (every minute) | `AssessmentServiceImpl.updateExpiredAssessments` | Bulk-updates rows past their deadline |
| every 5 min | `VoiceInterviewServiceImpl.enforceInterviewTimeouts` | Auto-completes `IN_PROGRESS` interviews older than `interview.max-duration-minutes` |
| every 5 min | `OtpService` | Purges expired OTPs |

## Persistence

- MySQL 8; `spring.jpa.hibernate.ddl-auto=update` on **every** profile — the
  schema is Hibernate-managed, there is no Flyway/Liquibase. Schema changes are
  recorded by hand under `backend/docs/migrations/`.
- `RbacSeedConfig` runs as a `CommandLineRunner` on boot and idempotently seeds
  every `PermissionName`, the `ADMIN` and `USER` roles, and their default
  permission sets. `SUPER_ADMIN` is only refreshed if the row already exists —
  a deliberate guard, because some deployments have a `roles.name` column too
  small to hold the string and would fail startup.
- Binary data lives in two places: small blobs in MySQL (`profileImage`,
  `resumeData`, `answerKey` as `LONGBLOB`/`@Lob`) and media in S3 (interview
  recordings, screen recordings, proctoring captures) referenced by
  `containerName` + `fileName`.

## Error handling and logging

- `RequestResponseLoggingFilter` stamps a correlation id into the MDC; the log
  pattern `%5p [%X{requestId:-}]` prints it on every line, empty for
  non-request logs such as startup.
- Errors return a consistent envelope; the client mirrors its shape in
  `ApiErrorEnvelope` and surfaces messages through
  [`src/config/error-messages.ts`](../src/config/error-messages.ts).
- `ErrorClassifier` turns raw compiler/runtime output into a typed
  `ExecutionStatus` plus a candidate-readable message.

## API documentation

springdoc is enabled per profile. In dev: UI at `/swagger-ui.html`, spec at
`/v3/api-docs`, operations sorted by method and tags alphabetically.
