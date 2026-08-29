# 06 — API Reference

Every REST endpoint and WebSocket destination the backend exposes, with the
authority it requires and the level it belongs to.

- **Auth column**: `public` = in the security allowlist; `auth` = any valid access
  token; otherwise the `@PreAuthorize` authority name.
- **L**: `1` = assessment track, `2` = interview track, `-` = platform-wide.
- Client-side path constants live in
  [`src/config/api.endpoints.ts`](../src/config/api.endpoints.ts).

Interactive spec: `/swagger-ui.html`, raw at `/v3/api-docs` (enabled per profile).

---

## Authentication and users — `AuthenthicationController` (`/api`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/api/register` | public | - |
| POST | `/api/login` | public | - |
| POST | `/api/refresh` | public (refresh cookie) | - |
| POST | `/api/logout` | public | - |
| GET | `/api/me` | auth | - |
| POST | `/api/generate-otp` | public | - |
| POST | `/api/validate-otp` | public | - |
| PUT | `/api/update-password` | public (post-OTP) | - |
| PUT | `/api/change-password` | `USER_UPDATE` | - |
| GET | `/api/users` | `USER_LIST` | - |
| GET | `/api/profile-details/{email}` | `USER_READ` | - |
| PUT | `/api/update/{email}` | `USER_UPDATE` | - |
| GET | `/api/profile-image/{email}` | `USER_READ` | - |
| POST | `/api/updateActive` | `USER_ACTIVATE` | - |
| POST | `/api/updateDeactive` | `USER_DEACTIVATE` | - |

## RBAC administration — `RbacAdminController` (`/api/admin/rbac`)

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/assign-role` | `USER_UPDATE` |
| POST | `/remove-role` | `USER_UPDATE` |
| GET | `/user` | `USER_READ` |
| GET | `/roles` | `USER_READ` |

## Jobs — `JobPostController` (`/api/jobs`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/post` | `JOB_POST_CREATE` | 1 |
| PUT | `/post/{id}` | `JOB_POST_UPDATE` | 1 |
| DELETE | `/post/{id}` | `JOB_POST_DELETE` | 1 |
| GET | `/getPost` | `JOB_POST_READ` | 1 |
| GET | `/counts` | `JOB_POST_READ` | 1 |
| GET | `/job-types` | `JOB_POST_READ` | 1 |
| POST | `/apply/{jobId}` | `JOB_APPLY` | 1 |
| GET | `/applications/count/{jobId}` | `JOB_APPLICATION_READ_ALL` | 1 |

## Job applications — `JobApplicationForCandidateController` (`/api/job-applications`)

Note: this whole prefix is in the security allowlist in `ApiSecurityConfig`, so
authorization is enforced entirely by the `@PreAuthorize` annotations below —
see the note in [08-security-rbac.md](08-security-rbac.md).

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/apply` (multipart) | `JOB_APPLY` | 1 |
| PATCH | `/update` (multipart) | `JOB_APPLY` | 1 |
| GET | `/{email}` | `JOB_APPLY` | 1 |
| GET | `/byJobPrefixAndEmail/{jobPrefix}/{email}` | `JOB_APPLY` | 1 |
| GET | `/getAllApplications` | `JOB_APPLICATION_READ_ALL` | 1 |
| GET | `/byJobPrefix/{jobPrefix}` | `JOB_APPLICATION_READ_ALL` | 1 |
| GET | `/filter/{jobPostId}` | `JOB_APPLICATION_READ_ALL` | 1 |
| GET | `/filterByPrefix/{jobPrefix}` | `JOB_APPLICATION_READ_ALL` | 1 — **deprecated**, re-screens the whole job on every GET |
| GET | `/applicants/{jobPostId}` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/screen` | `JOB_APPLICATION_READ_ALL` | 1 |
| PATCH | `/shortlist` | `JOB_APPLICATION_READ_ALL` | 1 |
| PATCH | `/referral-status` | `JOB_APPLICATION_READ_ALL` | 1 |
| GET | `/ats-screening/{jobPrefix}` | `JOB_APPLICATION_READ_ALL` | 1 |
| GET | `/ats-rejected/{jobPrefix}` | `JOB_APPLICATION_READ_ALL` | 1 |
| GET | `/acknowledge` | `JOB_APPLY` | 1 |
| POST | `/send-ack-mail` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/send-reconfirmation-mail` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/send-rejection-mail` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/send-exam-link` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/send-success-mail` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/send-failure-mail` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/update-written-test-status` | `JOB_APPLICATION_READ_ALL` | 1 |
| POST | `/schedule-interview` | `JOB_APPLICATION_READ_ALL` | 2 |

## Resumes and ATS — `ResumeController`, `ATSController` (`/api`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/api/upload-resume` | `RESUME_UPLOAD` | 1 |
| PUT | `/api/update-resume` | `RESUME_UPDATE` | 1 |
| GET | `/api/view-resume/{email}` | `RESUME_VIEW` | 1 |
| POST | `/api/upload-single-resumes` | auth | 1 |
| POST | `/api/upload-multiple-resumes` | `ATS_UPLOAD_MULTI` | 1 |

## Question generation — `QuestionController` (`/api`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| GET | `/api/generate-questions?jobPrefix=` | `QUESTION_GENERATE` | 1 |
| GET | `/api/generate-coding-questions?jobPrefix=` | `CODING_QUESTION_GENERATE` | 1 |

Both are slow (`gpt-4o`); the client allows 330 s.

## Assessments — `AssessmentController` (`/api`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/api/upload` | `ASSESSMENT_UPLOAD` | 1 |
| POST | `/api/assign` | `ASSESSMENT_ASSIGN` | 1 |
| POST | `/api/assign-blob` | `ASSESSMENT_ASSIGN` | 1 |
| PATCH | `/api/assessments/{id}/schedule` | `ASSESSMENT_ASSIGN` | 1 |
| GET | `/api/getCandidateAssessments/{candidateEmail}` | auth | 1 — pending only (expired and attended filtered out) |
| GET | `/api/getAssessments?candidateEmail=` | auth | 1 — everything, attended included |
| GET | `/api/fetchAssessment/{id}` | auth | 1 |
| GET | `/api/assessments/{id}/content` | auth | 1 |
| GET | `/api/assessment-content/{id}` | auth | 1 |
| GET | `/api/assessments/content/latest` | auth | 1 |
| GET | `/api/question-paper` | auth | 1 |
| POST | `/api/markExamAttended` | auth | 1 |
| POST | `/api/submit/{id}` | `ASSESSMENT_SUBMIT` | 1 |
| POST | `/api/result` | `ASSESSMENT_RESULT_SUBMIT` | 1 |
| GET | `/api/get-results?email=&jobPrefix=` | auth | 1 |
| GET | `/api/get-results-by-job-prefix?jobPrefix=` | `JOB_APPLICATION_READ_ALL` | 1 |
| GET | `/api/get-results-by-id/{id}` | auth | 1 |

`POST /api/result` takes the answer JSON as the **body** and
`candidateEmail`, `assessmentType`, `score`, `jobPrefix`, `assessmentId`,
`totalMarks`, `percentage` as **query params**. `percentage` is what the pass
mark is compared against.

## Code execution — `CompilerController` (`/api/compiler`), `CompileController` (`/api/compile`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/api/compiler/run` | `COMPILER_RUN` | 1 |
| POST | `/api/compiler/saveUnattemptedSubmissions` | `COMPILER_RUN` | 1 |
| GET | `/api/compiler/results` | `COMPILER_RESULTS_READ` | 1 |
| GET | `/api/compiler/results/code` | `COMPILER_RESULTS_READ` | 1 |
| GET | `/api/compiler/results/by-job-prefix` | `COMPILER_RESULTS_READ` | 1 |
| GET | `/api/compiler/results/{userEmail}/{language}` | `COMPILER_RESULTS_READ` | 1 |
| GET | `/api/compiler/results/{userEmail}/question/{questionId}` | `COMPILER_RESULTS_READ` | 1 |
| GET | `/api/compiler/results/{userEmail}/passed/{passed}` | `COMPILER_RESULTS_READ` | 1 |
| GET | `/api/compiler/results/{userEmail}/filter` | `COMPILER_RESULTS_READ` | 1 |
| POST | `/api/compile` | public | 1 |

> The client's `COMPILER.SAVE_UNATTEMPTED` points at
> `/api/compiler/save-unattempted`, which does not exist — see
> [10-project-status.md](10-project-status.md).

## Exam proctoring — `ExamProctoringController` (`/api/exam-proctoring`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/identity-photo` (multipart) | auth (candidate) | 1 |
| POST | `/room-scan` (multipart) | auth (candidate) | 1 |
| GET | `/assessments/{assessmentId}/captures` | `ASSESSMENT_READ` | 1 |
| GET | `/captures` | `ASSESSMENT_READ` | 1 |
| GET | `/captures/{captureId}/image` | `ASSESSMENT_READ` | 1 |

## Interview — `InterviewController` (`/api/interview`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/assign-interview` | `INTERVIEW_ASSIGN` | 2 |
| POST | `/assign-interview-bulk` | `INTERVIEW_ASSIGN` | 2 |
| GET | `/results` | `INTERVIEW_ASSIGN` | 2 |
| GET | `/results/{id}` | `INTERVIEW_ASSIGN` | 2 |
| GET | `/stats` | `INTERVIEW_ASSIGN` | 2 |
| GET | `/{scheduleId}/proctoring-events` | `INTERVIEW_ASSIGN` | 2 |
| GET | `/{scheduleId}/conversation` | `INTERVIEW_ASSIGN` | 2 |
| GET | `/active` | `INTERVIEW_START` | 2 |
| POST | `/start` | `INTERVIEW_START` | 2 |
| POST | `/answer` | `INTERVIEW_ANSWER` | 2 |
| POST | `/voice-to-text` (multipart) | `INTERVIEW_ANSWER` | 2 |
| POST | `/{interviewScheduleId}/video` (multipart) | `INTERVIEW_ANSWER` | 2 |
| POST | `/{interviewScheduleId}/screen-recording` (multipart) | `INTERVIEW_ANSWER` | 2 |
| POST | `/voice/start` | `INTERVIEW_START` | 2 |
| POST | `/voice/{id}/end` | `INTERVIEW_ANSWER` | 2 |
| GET | `/voice/{id}/status` | `INTERVIEW_START` | 2 |
| GET | `/voice/{id}/evaluation` | `INTERVIEW_START` | 2 |
| GET | `/voice/{scheduleId}/resume` | `INTERVIEW_START` | 2 |
| POST | `/verification-session` | auth | 2 |
| POST | `/verify-room` (multipart) | auth | 2 |
| GET | `/verification-status` | auth | 2 |
| POST | `/upload-interview-questions` (multipart) | `INTERVIEW_ASSIGN` | 2 |
| POST | `/update-questions/{jobPrefix}` | `INTERVIEW_ASSIGN` | 2 |
| GET | `/questions` | `INTERVIEW_START` | 2 |

## Prompts — `JobPromptController` (`/api/prompts`)

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| GET | `/{prefix}` | `JOB_POST_CREATE` | 1+2 |
| POST | `/` | `JOB_POST_CREATE` | 1+2 |
| GET | `/evaluation-categories/{prefix}` | `JOB_POST_CREATE` | 2 |
| POST | `/evaluation-categories` | `JOB_POST_CREATE` | 2 |

## Mobile, messaging and platform

| Method | Path | Auth | L |
| --- | --- | --- | --- |
| POST | `/api/mobile/verify-room` | public | 2 |
| POST | `/api/mobile/monitor` | public | 2 |
| POST | `/whatsapp/send` | auth | - |
| GET | `/header-count` | auth | - |
| GET | `/actuator/health` | public | - |
| GET | `/error/invalid-request` | public | - |

Actuator exposes only `health` and `info`.

---

## WebSocket

**Endpoints** (`config/WebSocketConfig.java`)

| Endpoint | Protocol |
| --- | --- |
| `/ws` | SockJS + STOMP |
| `/ws/terminal` | Raw WebSocket handler |

**Broker** — simple broker on `/queue` and `/topic`; app prefix `/app`; user
prefix `/user`. Origins come from `app.cors.allowed-origins`. Handshake auth by
`WebSocketAuthInterceptor`; every message handler re-verifies schedule ownership.

### Voice interview (L2)

| Direction | Destination | Payload |
| --- | --- | --- |
| → server | `/app/interview/{scheduleId}/audio-chunk` | `{ audio: <base64> }`, max 200 KB |
| → server | `/app/interview/{scheduleId}/submit-answer` | `VoiceAnswerRequest` |
| → server | `/app/interview/{scheduleId}/interrupt` | barge-in |
| → server | `/app/interview/{scheduleId}/proctoring-event` | event type + details |
| ← client | `/topic/interview/{id}/transcription` | live transcript |
| ← client | `/topic/interview/{id}/transcription-error` | errors incl. auth failures |
| ← client | `/topic/interview/{id}/ai-token` | streamed answer tokens |
| ← client | `/topic/interview/{id}/response-complete` | end of AI turn |
| ← client | `/topic/interview/{id}/tts-audio` | synthesised speech |
| ← client | `/topic/interview/{id}/tts-fallback` | use browser speech synthesis |
| ← client | `/topic/interview/{id}/filler` | filler phrase while the model works |

### Mobile pairing / room scan (L2)

| Direction | Destination |
| --- | --- |
| → server | `/app/desktop/register` |
| → server | `/app/mobile/register` |
| → server | `/app/mobile/offer/{token}` |
| → server | `/app/mobile/answer/{token}` |
| → server | `/app/mobile/ice/{token}` |
| → server | `/app/mobile/verified/{token}` |
| ← client | `/user/queue/mobile/offer` |
| ← client | `/user/queue/mobile/answer` |
| ← client | `/user/queue/mobile/ice` |
| ← client | `/user/queue/mobile/ready` |
| ← client | `/user/queue/mobile/verified` |
| ← client | `/user/queue/mobile/warning` |

### Other

`/topic/jobPosts` — broadcast when the job list changes.
