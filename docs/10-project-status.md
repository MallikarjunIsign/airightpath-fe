# 10 — Project Status

Where the platform stands as of **2026-08-27**, branch `staging`.

Status read from the code, not from a plan: **Complete** means the path exists
end to end on both sides and is wired into the UI. **Partial** means it works
with a caveat. **Gap** means something is referenced but missing, or drifting.

---

## L1 — Assessment track

| Capability | Status | Notes |
| --- | --- | --- |
| Job posting (create/read) | Complete | `JobPostController` + admin screens |
| Job update / delete | Complete | `PUT`/`DELETE /api/jobs/post/{id}` exist and are permissioned. The client comments in `api.endpoints.ts` still call them "pending backend delivery" — stale |
| Shareable per-job apply link | Complete | `applyJobUrl(jobPrefix)`, `/candidate/apply/:jobPrefix` |
| Candidate application + resume upload | Complete | Multipart, PDF/DOC/DOCX, 2 MB |
| Referral capture and verification | Complete | `ReferralStatus`, admin `PATCH /referral-status` |
| ATS screening (single + batch) | Complete | TF-IDF + skills + experience + education, threshold 60.0 |
| Scoped screening (only selected emails) | Complete | `POST /screen` with an email list; replaces the deprecated `filterByPrefix` |
| Manual shortlisting with override | Complete | `PATCH /shortlist` |
| Candidate mail suite | Complete | Ack, reconfirmation, exam link, success, failure, rejection — templated, branding centralised in `app.mail.*` |
| Aptitude question generation (AI) | Complete | `gpt-4o`, prompt-driven per job |
| Coding question generation (AI) | Complete | `gpt-4o`, with test cases |
| Question paper upload | Complete | Plus client-side question counting |
| Assessment assignment | Complete | Per-candidate rows, exam window, per-question timing, pass mark |
| Assignment survives a mail outage | Complete | `AssignmentReportDTO` names who was not emailed; covered by `AssignmentSurvivesMailOutageTest` |
| Exam rescheduling | Complete | `PATCH /assessments/{id}/schedule`, `notify` defaults true (commit `97ee127`) |
| Automatic expiry | Complete | Per-minute bulk update + hourly sweep |
| Pre-exam checks | Complete | Desktop, camera, face, noise, identity photo, room scan — all env-switchable |
| Identity photo + room scan capture | Complete | Stored in object storage, admin-viewable |
| Aptitude exam | Complete | Proctored, timed, auto-submit, both option formats normalised |
| Coding exam | Complete | Monaco, 5 languages, run against test cases, configurable visibility |
| Server-side code execution | Complete | Compile-once engine, per-step + total timeouts, typed `ExecutionStatus`, `503` when a toolchain is missing |
| Proctoring during the exam | Complete | Fullscreen, tab switches, face warnings, devtools, reload guard |
| Auto-submit on violation/timeout | Complete | Reason and timing recorded in `__submissionMeta` |
| Grading | Complete | Percentage vs the paper's `passPercentage` |
| Result views (admin + candidate) | Complete | Shared maths so both quote identical numbers |
| Multiple attempts per module | Complete | Attempts kept, latest surfaced, ordering fixed in commits `bc835a5` / `cec21c5` |
| Excel export | Complete | Typed cells, plus the final summary sheet with per-candidate metrics (commit `e8d8111`) |
| PDF answer sheets / question-paper export | Complete | jsPDF |

**L1 is functionally complete end to end**, from job post to exam result.

## L2 — Interview track

| Capability | Status | Notes |
| --- | --- | --- |
| Evaluation categories with weights | Complete | Per job, drives the score |
| Per-job interview prompts | Complete | `PromptType.INTERVIEW`, stages `START` / `SUMMARY` |
| Interview question upload / generation | Complete | Per job and per category |
| Interview scheduling (single + bulk) | Complete | Window, mail, status transition |
| Candidate interview list and entry | Complete | Pre-start screen, countdown, permission checks |
| Mobile pairing + WebRTC room scan | Complete | QR pairing, offer/answer/ICE over STOMP |
| AI room verification | Complete | `gpt-4o` vision, `RoomVerificationSession` |
| Voice interview (6 phases) | Complete | Adaptive difficulty 1–5, phase budgets |
| Streaming AI responses + TTS | Complete | `ai-token` / `tts-audio`, browser fallback topic |
| Live transcription | Complete | `whisper-1` on a dedicated pool |
| Filler audio while the model thinks | Complete | `/topic/interview/{id}/filler` |
| Barge-in / interrupt | Complete | `/app/interview/{id}/interrupt` |
| Coding questions inside the interview | Complete | Editor + `codeContent`/`codeLanguage` on the entry |
| Interview proctoring | Complete | Events persisted, warning count, escalation |
| Video + screen recording | Complete | Chunked upload to S3, references on the schedule |
| Early termination on poor performance | Complete | Six tunable heuristics |
| Server-side timeout enforcement | Complete | 5-minute sweep of stale `IN_PROGRESS` |
| Resume after disconnect | Complete | `GET /voice/{id}/resume` |
| Weighted evaluation + speech metrics | Complete | Categories, WPM, fillers, confidence |
| PDF interview report | Complete | `InterviewReportServiceImpl` + `PdfReportGenerator` |
| Admin results, stats, transcript, events | Complete | All under `INTERVIEW_ASSIGN` |

**L2 is functionally complete end to end**, from scheduling to evaluation.

## Platform

| Capability | Status | Notes |
| --- | --- | --- |
| Registration, login, logout | Complete | Registration atomicity covered by test |
| Access + rotating refresh tokens | Complete | Hashed storage, reuse detection, session revocation |
| Cross-tab session handling | Complete | Single-flight refresh + Web Locks + BroadcastChannel |
| OTP password reset | Complete | Mail-delivered, auto-purged |
| Change password | Complete | |
| RBAC (DB-backed, seeded) | Complete | Method-level `@PreAuthorize` throughout |
| Runtime role assignment | Complete | `/api/admin/rbac/*` |
| User list, activate/deactivate | Complete | `SUPER_ADMIN` only |
| Profile + avatar | Complete | |
| Theme (light/dark) | Complete | Token-based |
| Toasts, error envelope, error boundary | Complete | Non-React code can raise toasts via `toast-events` |
| Correlation-id logging | Complete | On every log line |
| OpenAPI/Swagger | Complete | Per-profile toggle |
| Docker images (FE + BE) | Complete | Toolchains verified at build time |
| Health endpoint | Complete | `health` + `info` only |

---

## Partial

| Item | Detail |
| --- | --- |
| **Backend test coverage** | 22 test classes, concentrated on job posts, assessment timing, scheduling validation, code execution, error classification, proctoring upload binding, email rendering, status transitions. Interview/voice, ATS scoring and the auth token flow have no direct tests |
| **Frontend test coverage** | None. No test runner in `package.json`; the quality gates are `npm run typecheck` and `npm run lint` |
| **Schema migrations** | `ddl-auto=update` on every profile including prod. Changes are documented by hand in `backend/docs/migrations/`, with no Flyway/Liquibase |
| **Azure Blob storage** | `AzureBlobStorageService` exists alongside `S3StorageService`; S3 is what the profiles configure |
| **AWS Rekognition** | On the classpath; face checks in the shipped flow are `gpt-4o` vision and client-side face-api.js |
| **WhatsApp / Twilio** | `WhatsAppController` and `WhatsAppService` work but are not part of the candidate journey; dev credentials are placeholders |
| **Terminal WebSocket** | `/ws/terminal` and `TerminalSocketHandler` are wired with config (120 s execution, 5 sessions/user); no UI drives them |
| **`CompileController`** | `POST /api/compile` is public and duplicates part of `/api/compiler/run` |
| **React Query** | A dependency, but most screens call services directly — caching/invalidation is inconsistent across pages |

## Gaps and drift

Concrete, verified mismatches worth fixing.

1. **`COMPILER.SAVE_UNATTEMPTED` points at a path that does not exist.**
   [`api.endpoints.ts`](../src/config/api.endpoints.ts) declares
   `/api/compiler/save-unattempted`; the backend mapping is
   `/api/compiler/saveUnattemptedSubmissions`, and it expects a
   `List<CodeSubmissionRequestDTO>`, not the `{ assessmentId, candidateEmail }`
   the client would send. Currently harmless — `compilerService.saveUnattempted`
   is defined but never called — so fix it before wiring it into the exam.

2. **`RESUME.UPLOAD_MULTIPLE` points at a path that does not exist.**
   `/api/upload-resumes` has no backend mapping; the real bulk route is
   `/api/upload-multiple-resumes` (`ATSController`). `resumeService.uploadMultiple`
   is unused; the batch screen goes through `atsService.screenBatch`, which uses
   the correct path.

3. **`ATS.SCREEN_SINGLE` points at a path that does not exist.**
   `/api/ats/screen` has no `/api/ats` controller. The single-resume route is
   `/api/upload-single-resumes`. Unused today.

4. **`src/config/permissions.ts` does not match the backend enum.** It defines
   names that do not exist server-side (`USER_WRITE`, `USER_DELETE`,
   `ASSESSMENT_WRITE`, `JOB_READ`, `ATS_WRITE`, `INTERVIEW_READ`,
   `QUESTION_READ`, `RESULT_READ`, `RESULT_WRITE`, `PROMPT_READ`,
   `PROMPT_WRITE`) and omits most real ones. A `PermissionGate` keyed to an
   invented name can never open. Regenerate it from
   `com.rightpath.rbac.PermissionName`.

5. **Stale "pending backend delivery" comments.** `api.endpoints.ts` says job
   update and delete await the backend; both shipped. `job.service.ts` still
   carries `isEndpointMissing` fallbacks for them.

6. **`/api/job-applications/**` is entirely in the security allowlist.** Its
   endpoints all carry `@PreAuthorize`, so access control holds — but the
   chain-level net is missing for that prefix. Narrow it to `/apply` and
   `/acknowledge`.

7. **`cookie-secure: false` in every profile**, including prod.

8. **Secrets committed as YAML defaults** — DB password, JWT secret, OpenAI key,
   AWS keys, Twilio token, mail password. Override via env and rotate.

9. **Prod points at a dev-named database on the dev RDS instance**
   (`Rightpath-dev` on `ai-rightpath-db-dev`), shared with `stage`.

10. **`.env.development` mixes ports** — API on `:8081`, WS on `:8082`.

11. **`docs/backend-requirements-exam-capture.md`** is written as a contract for
    work to be delivered; the endpoints it specifies now exist. Re-read it as
    reference and mark it delivered.

12. **`README.md` is still the Azure DevOps template.** `RIGHTPATH_DOCUMENTATION.md`
    also describes roles that do not exist in code (`HR`, `Interviewer`) and a
    Supabase-era schema.

## Suggested next steps

**Correctness** — fix gaps 1–5; they are small and each removes a latent bug.

**Security** — gaps 6–8 before any production hardening review.

**Confidence** — add tests where the money is: interview evaluation scoring, ATS
scoring, and the refresh-token rotation/reuse path. Add a frontend test runner
(Vitest) and start with `result.utils.ts`, `exam-duration.utils.ts` and
`results-export.utils.ts`, which are pure and carry the grading maths.

**Operability** — introduce Flyway before the schema drifts further from what
`ddl-auto=update` produced.

---

## How to update this file

Move a row's status when the behaviour changes, not when the ticket closes.
When you close a gap, delete its entry rather than marking it done — the list is
meant to be short and current. When you add a capability, add it to the L1 or L2
table in the order the flow runs, so the table stays readable as a sequence.
