# 05 — L2: Interview Flow

**L2 begins after the L1 exam results exist.** A recruiter schedules the AI
voice interview, the candidate sits it in the browser, and the platform produces
a weighted evaluation and a `PASSED` / `FAILED` verdict.

This file is the working map. Two longer companions already exist and stay
current:

- [AI-Interview-Process-Overview.md](AI-Interview-Process-Overview.md) — the same
  flow in plain language, step by step.
- [AI-Interview-Technical-Flow.md](AI-Interview-Technical-Flow.md) — threads,
  OpenAI call sites, recovery paths.
- [../VOICE_INTERVIEW_ARCHITECTURE.md](../VOICE_INTERVIEW_ARCHITECTURE.md) —
  architecture with sequence diagrams.

```
1. Evaluation categories   admin defines what is scored and how heavily
2. Interview questions     uploaded or generated per job
3. Interview scheduled     window + candidate list, mail sent
4. Candidate joins         pre-start checks, optional phone room scan
5. Voice interview         6 phases, adaptive difficulty, live proctoring
6. Recordings stored       webcam + screen, transcript, proctoring events
7. AI evaluation           weighted categories + speech metrics
8. Interview result        PASSED / FAILED / PENDING, admin review
```

---

## 1. Evaluation categories and prompts

**Frontend** — [`JobPromptPage`](../src/pages/admin/JobPromptPage.tsx).

**Backend** — `JobPromptController` (`/api/prompts`, `JOB_POST_CREATE`):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/prompts/{prefix}` | Prompts for a job |
| `POST /api/prompts` | Save a prompt |
| `GET /api/prompts/evaluation-categories/{prefix}` | Categories and weights |
| `POST /api/prompts/evaluation-categories` | Save categories |

`JobPrompt` is keyed by `(jobPrefix, promptType, promptStage)` where
`PromptType` is `APTITUDE | CODING | INTERVIEW` and `PromptStage` is
`START | SUMMARY`. `EvaluationCategory` is keyed by
`(jobPrefix, categoryName)` and carries a `weight` and description — those
weights are what the final score is computed against.

Base interview prompt text lives in `interview-prompts.properties`, with
placeholders resolved by `PromptPlaceholderResolver`.

## 2. Interview questions

| Endpoint | Permission |
| --- | --- |
| `POST /api/interview/upload-interview-questions` (multipart) | `INTERVIEW_ASSIGN` |
| `POST /api/interview/update-questions/{jobPrefix}` | `INTERVIEW_ASSIGN` |
| `GET /api/interview/questions` | `INTERVIEW_START` |

Uploaded files become `UploadInterviewQuestions` rows; per-schedule questions
become `InterviewQuestion` rows (`interviewScheduleId`, `uniqueId`, `level`,
`questionText`, `count`). `InterviewQuestionsServiceImpl` and
`OpenAiServiceImpl.generateQuestionsForCategories` can generate questions per
evaluation category (`questions.additional.count` defaults to 100).

## 3. Scheduling

**Frontend** — [`InterviewSchedulerPage`](../src/pages/admin/InterviewSchedulerPage.tsx).

**Backend** — `InterviewController`, both `INTERVIEW_ASSIGN`:

- `POST /api/interview/assign-interview`
- `POST /api/interview/assign-interview-bulk`

Each creates a `CandidateInterviewSchedule` with `jobPrefix`, `email`,
`questionsFromDate`, `questionsToDate`, `assignedAt`, `deadlineTime`,
`attemptStatus = NOT_ATTEMPTED`, `currentPhase = INTRODUCTION`,
`difficultyLevel = 2`, `interviewerName = "Sarah"`. The candidate is mailed
(`EmailType.INTERVIEW_SCHEDULE`). The application status moves to
`INTERVIEW_SCHEDULED`.

`POST /api/job-applications/schedule-interview` is the equivalent trigger from
the candidate-pipeline screen.

## 4. Candidate joins

**Frontend** — [`InterviewListPage`](../src/pages/candidate/InterviewListPage.tsx)
lists active interviews (`GET /api/interview/active`, `INTERVIEW_START`), then
[`InterviewPage`](../src/pages/candidate/InterviewPage.tsx) runs inside
[`InterviewLayout`](../src/components/layout/InterviewLayout.tsx) — the same
no-chrome lockdown as the exam.

[`InterviewPreStartScreen`](../src/components/interview/InterviewPreStartScreen.tsx)
handles permissions and the countdown
(`INTERVIEW_INSTRUCTION_COUNTDOWN_SECONDS` = 30).

**Optional phone room scan** — the desktop shows a QR code
(`qrcode.react`); the phone opens `/mobile-connect`
([`MobileConnect`](../src/pages/candidate/MobileConnect.tsx)) and the two pair
over STOMP, then exchange WebRTC offer/answer/ICE so the phone's camera streams
to the desktop session:

| Direction | Destination |
| --- | --- |
| Desktop → server | `/app/desktop/register` |
| Phone → server | `/app/mobile/register` |
| Phone → server | `/app/mobile/offer/{token}` |
| Desktop → server | `/app/mobile/answer/{token}` |
| Both → server | `/app/mobile/ice/{token}` |
| Phone → server | `/app/mobile/verified/{token}` |
| Server → client | `/user/queue/mobile/{offer,answer,ice,ready,verified,warning}` |

Handled by `MobileWebSocketController` and `MobileConnectionServiceImpl`.
Room images can also be checked by `gpt-4o` vision through
`AiRoomVerificationService` / `RoomVerificationService`, producing a
`RoomVerificationSession` with status `PENDING | VERIFIED | FAILED`.
REST equivalents: `POST /api/interview/verification-session`,
`POST /api/interview/verify-room`, `GET /api/interview/verification-status`,
plus `/api/mobile/verify-room` and `/api/mobile/monitor`.

## 5. The interview itself

**Start** — `POST /api/interview/voice/start` (`INTERVIEW_START`) sets
`attemptStatus = IN_PROGRESS` and `startedAt`, then returns the opening
question. The client hook is
[`useVoiceInterview`](../src/hooks/useVoiceInterview.ts).

**Transport** — SockJS + STOMP on `/ws`. SockJS only carries text frames, so
audio is base64-encoded inside JSON (chunks capped at 200 KB server-side).

| Direction | Destination | Payload |
| --- | --- | --- |
| Client → server | `/app/interview/{scheduleId}/audio-chunk` | `{ audio: base64 }` |
| Client → server | `/app/interview/{scheduleId}/submit-answer` | `VoiceAnswerRequest` |
| Client → server | `/app/interview/{scheduleId}/interrupt` | Candidate barge-in |
| Client → server | `/app/interview/{scheduleId}/proctoring-event` | Event type + details |
| Server → client | `/topic/interview/{id}/transcription` | Live transcript |
| Server → client | `/topic/interview/{id}/transcription-error` | Errors, including auth failures |
| Server → client | `/topic/interview/{id}/ai-token` | Streaming answer tokens |
| Server → client | `/topic/interview/{id}/response-complete` | End of the AI turn |
| Server → client | `/topic/interview/{id}/tts-audio` | Synthesised speech |
| Server → client | `/topic/interview/{id}/tts-fallback` | Browser speech-synthesis fallback |
| Server → client | `/topic/interview/{id}/filler` | "Let me think…" filler while the model works |

Every handler calls `verifyOwnership(scheduleId, headerAccessor)` — the schedule
must belong to the authenticated email from the handshake, or the message is
dropped and an error is published. Answers are deduplicated by
`scheduleId + transcript hash` for 60 s, with a daemon thread pruning the map
every 5 minutes.

**Phases** — `InterviewPhase` is the script, each phase carrying its own budget:

| Phase | Minutes | Target questions | Focus |
| --- | --- | --- | --- |
| `INTRODUCTION` | 3 | 2 | Warm-up |
| `BACKGROUND` | 8 | 3 | Resume and experience |
| `TECHNICAL` | 20 | 6 | Role-specific technical |
| `PROBLEM_SOLVING` | 12 | 3 | Scenario and system design |
| `BEHAVIORAL` | 10 | 3 | STAR-format behavioural |
| `CLOSING` | 5 | 1 | Wrap-up and candidate questions |

`difficultyLevel` (1–5, starting at 2) moves with answer quality.
`runningSummary` keeps the conversation inside the context window
(`interview.context-window-size` = 4 recent turns plus the summary), maintained
by `InterviewContextService`.

**Coding inside the interview** —
[`CodingEditor`](../src/components/interview/CodingEditor.tsx) lets the AI set a
coding task mid-interview; the answer is stored on the conversation entry as
`codeContent` + `codeLanguage`.

**Proctoring** — face detection, tab/visibility checks and devtools detection
run continuously and publish to `/app/interview/{id}/proctoring-event`, stored as
`ProctoringEvent` rows and readable by admins at
`GET /api/interview/{scheduleId}/proctoring-events`.
`warningCount` on the schedule drives escalation (`interview.max-warnings` = 5).

**Recordings** — `useMediaRecorder` and `useScreenRecorder` post chunks to
`POST /api/interview/{id}/video` and `POST /api/interview/{id}/screen-recording`
(15 s video chunks, 4 s audio chunks, `audio/webm;codecs=opus`). S3 keys are
kept on the schedule as `recordReferences` / `screenRecordReferences`.

**Timing guards** — client-side inactivity warning at 120 s and timeout at
180 s; question timeouts of 300 s (600 s for coding); server-side, a job every
5 minutes auto-completes any `IN_PROGRESS` interview older than
`interview.max-duration-minutes` (60).

## 6. Ending

`CompletionReason` records why an interview stopped:

| Reason | Trigger |
| --- | --- |
| `NATURAL_COMPLETION` | All phases finished |
| `CANDIDATE_ENDED` | Candidate ended it |
| `TIMEOUT` | Duration exceeded (client or the 5-minute sweep) |
| `PROCTORING_VIOLATION` | Warning ceiling reached |
| `MAX_SKIPS` | `INTERVIEW_MAX_CONSECUTIVE_SKIPS` = 3 |
| `EARLY_TERMINATION_POOR_PERFORMANCE` | Early-termination heuristics below |

Early termination (`interview.early-termination.*`, dev defaults): only after
`min-questions` = 4, when skip ratio > 0.5, average word count < 15, confidence
< 30.0, 2 consecutive skips, or 3 consecutive short answers.

`POST /api/interview/voice/{id}/end` (`INTERVIEW_ANSWER`) closes the session and
sets `endedAt` and `attemptStatus = COMPLETED`.

**Resume after a drop** — `GET /api/interview/voice/{scheduleId}/resume` restores
an interrupted interview; `GET /api/interview/voice/{id}/status` reports where it
is.

## 7. Evaluation

`InterviewEvaluationService` scores the transcript against the job's
`EvaluationCategory` weights using `gpt-4o`, and `CandidatePerformanceAnalyzer` /
`ToneAnalysisService` add delivery metrics computed from the stored
`VoiceConversationEntry` rows: `wordCount`, `wordsPerMinute`, `fillerWordCount`,
`confidenceScore`, `speechDurationSeconds`.

The result is written to `evaluationJson` on the schedule and
`interviewResult` is set to `PASSED`, `FAILED` or `PENDING`.
`InterviewReportServiceImpl` + `PdfReportGenerator` produce the PDF report.

Read back with `GET /api/interview/voice/{id}/evaluation` (`INTERVIEW_START`)
and rendered by
[`EvaluationBreakdown`](../src/components/interview/EvaluationBreakdown.tsx) on
[`InterviewSummaryPage`](../src/pages/candidate/InterviewSummaryPage.tsx).

## 8. Admin review

[`InterviewResultsPage`](../src/pages/admin/InterviewResultsPage.tsx), backed by
(all `INTERVIEW_ASSIGN`):

| Endpoint | Returns |
| --- | --- |
| `GET /api/interview/results?jobPrefix=` | All interview results for a job |
| `GET /api/interview/results/{id}` | One interview in full |
| `GET /api/interview/stats?jobPrefix=` | Aggregate stats |
| `GET /api/interview/{scheduleId}/conversation` | Full transcript |
| `GET /api/interview/{scheduleId}/proctoring-events` | Every event raised |

From there the application moves to `INTERVIEW_COMPLETED` and then `SELECTED` or
`REJECTED`.

## Model and thread summary

| Purpose | Model | Pool |
| --- | --- | --- |
| Conversation | `gpt-4o` streaming (okhttp-sse) | request thread |
| Speech → text | `whisper-1` | `transcriptionExecutor` (4/8) |
| Text → speech | `tts-1-hd`, voice `nova` | `ttsExecutor` (2/4) |
| Vision / room checks | `gpt-4o` vision | request thread |
| Evaluation | `gpt-4o` | request thread |
