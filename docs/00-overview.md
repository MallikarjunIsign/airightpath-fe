# 00 — Product Overview

## What RightPath is

RightPath is an end-to-end hiring platform. A recruiter posts a job; candidates
apply with a resume; the platform screens those resumes automatically, runs the
shortlisted candidates through proctored online exams, then through an AI voice
interview, and presents scored results at every stage.

Two things distinguish it from a plain ATS:

1. **The exams are generated and graded by the platform.** Aptitude papers and
   coding problems can be produced from the job description by OpenAI, sat in a
   locked-down browser exam with camera proctoring, and — for coding — compiled
   and run against test cases on the server.
2. **The first interview is conducted by an AI.** A voice agent asks questions,
   listens, adapts difficulty, watches the candidate through the webcam, and
   produces a weighted evaluation the recruiter reviews instead of sitting the
   screening round themselves.

## Actors

| Actor | Role name | What they do |
| --- | --- | --- |
| Super Admin | `SUPER_ADMIN` | Everything, including user activation/deactivation and role assignment |
| Recruiter / Admin | `ADMIN` | Jobs, screening, exam assignment, interview scheduling, results |
| Candidate | `USER` | Applies, sits exams, sits the interview, views own results |

Roles are seeded on boot and carry permissions; see
[08-security-rbac.md](08-security-rbac.md).

## The two levels

The product is split at the point where automated assessment ends and the
interview begins. Everything the platform does before an interview is **L1**;
everything from the interview onwards is **L2**.

```
┌──────────────────────────── L1 — Assessment ───────────────────────────┐
│                                                                        │
│  Job post → Candidate applies → ATS resume screening → Shortlist       │
│      → Acknowledgement / reconfirmation mail → Exam assigned           │
│      → Pre-exam checks (identity photo, room scan, noise, camera)      │
│      → Aptitude exam        → graded                                   │
│      → Coding exam          → compiled, run, graded                    │
│      → APTITUDE + CODING RESULT  ◀── L1 ends here                      │
└────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── L2 — Interview ────────────────────────────┐
│                                                                        │
│  Interview scheduled → Candidate joins → AI voice interview            │
│      (6 phases, adaptive difficulty, live proctoring)                  │
│      → Transcript + recordings stored → AI evaluation (weighted)       │
│      → Interview result → Selected / Rejected                          │
└────────────────────────────────────────────────────────────────────────┘
```

- **L1 is documented in** [04-l1-assessment-flow.md](04-l1-assessment-flow.md).
- **L2 is documented in** [05-l2-interview-flow.md](05-l2-interview-flow.md).

## Candidate lifecycle as stored state

The application row carries the candidate's position in the funnel. The
`ApplicationStatus` enum is the canonical ladder:

```
APPLIED → SHORTLISTED → ACKNOWLEDGED → ACKNOWLEDGED_BACK → RECONFIRMED
        → EXAM_SENT → EXAM_COMPLETED        ◀── end of L1
        → INTERVIEW_SCHEDULED → INTERVIEW_COMPLETED   ◀── L2
        → SELECTED | REJECTED
```

`REJECTED` can be reached from any earlier state. Alongside the enum the
application row also keeps individual string flags (`atsScanStatus`,
`shortlistStatus`, `acknowledgedStatus`, `examLinkStatus`, `examCompletedStatus`,
`writtenTestStatus`, `rejectionStatus`) which drive the per-column badges on the
admin candidate table; see [07-data-model.md](07-data-model.md).

## Screen map

| Area | Route | Level |
| --- | --- | --- |
| Admin dashboard | `/admin/dashboard` | — |
| Jobs list / create / edit | `/admin/jobs`, `/admin/jobs/create`, `/admin/jobs/:jobPrefix/edit` | L1 |
| Candidates pipeline | `/admin/candidates` | L1 |
| ATS screening (single / batch) | `/admin/ats`, `/admin/ats/batch` | L1 |
| Upload question paper | `/admin/assessments/upload` | L1 |
| Assign assessment | `/admin/assessments/assign` | L1 |
| Assessment results | `/admin/assessments/results` | L1 |
| Candidate result detail | `/admin/assessments/results/:jobPrefix/:email` | L1 |
| Job prompts & evaluation categories | `/admin/prompts` | L1 + L2 |
| Interview scheduler | `/admin/interviews/schedule` | L2 |
| Interview results | `/admin/interviews/results` | L2 |
| Users & roles | `/admin/users` | — |
| Candidate: apply | `/candidate/apply/:jobPrefix` | L1 |
| Candidate: my assessments | `/candidate/assessments` | L1 |
| Candidate: exam instructions & pre-checks | `/candidate/instructions` | L1 |
| Candidate: aptitude exam | `/candidate/exam/aptitude` | L1 |
| Candidate: coding exam | `/candidate/exam/coding` | L1 |
| Candidate: results | `/candidate/results`, `/candidate/results/:id` | L1 |
| Candidate: interviews | `/candidate/interviews` | L2 |
| Candidate: interview room | `/candidate/interview` | L2 |
| Candidate: interview summary | `/candidate/interview/summary` | L2 |
| Mobile room-scan companion | `/mobile-connect` | L2 |

Full route table with guards: [03-frontend-architecture.md](03-frontend-architecture.md).

## Where the AI is used

| Purpose | Model | Where |
| --- | --- | --- |
| Aptitude question generation | `gpt-4o` | `OpenAiServiceImpl.generateQuestions` |
| Coding question generation | `gpt-4o` | `OpenAiServiceImpl.generateCodingQuestions` |
| Interview question generation | `gpt-4o` | `InterviewQuestionsServiceImpl`, `MainInterviewAiServiceImpl` |
| Interview conversation | `gpt-4o` (streaming) | `OpenAiStreamingService` |
| Speech → text | `whisper-1` | `SpeechToTextServiceImpl`, `AudioTranscriptionService` |
| Text → speech | `tts-1-hd`, voice `nova` | `TextToSpeechService` |
| Room / webcam frame checks | `gpt-4o` vision | `OpenAiVisionServiceImpl`, `AiRoomVerificationService` |
| Interview evaluation | `gpt-4o` | `InterviewEvaluationService` |

Resume-to-JD matching (ATS) is **not** an LLM — it is a deterministic TF-IDF +
skill/experience/education scorer in `ATSServiceImpl`.

## Non-AI building blocks worth knowing

- **Code execution** runs on the API host as real OS processes (`javac`/`java`,
  `python3`, `node`, `gcc`, `g++`) with per-step and whole-submission timeouts —
  `CodeExecutionEngine`.
- **Storage** for recordings, captures and papers is AWS S3 (`S3StorageService`),
  with an Azure Blob implementation also present (`AzureBlobStorageService`).
- **Mail** is SMTP through Spring Mail with Thymeleaf templates; every candidate
  touchpoint has a template and an `EmailType`.
- **WhatsApp/SMS** via Twilio exists (`WhatsAppService`) but is peripheral.
