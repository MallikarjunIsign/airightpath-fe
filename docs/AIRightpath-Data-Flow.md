# AIRightpath — Data Flow

Where data enters the platform, what transforms it, which store it lands in, and
what leaves. Eight diagrams, from the system boundary down to the two tracks and
the token exchange that guards them.

**Looking for the whole journey?** [Section 2](#2--end-to-end--login-to-assessment-complete)
traces login through to a graded result, from both the recruiter's side and the
candidate's, naming every endpoint on the way.

Companion to [AIRightpath-Technical-Reference.md](AIRightpath-Technical-Reference.md).
Every flow here was read out of the code; edge labels name the actual fields
written, not a paraphrase.

## Reading the diagrams

| Shape | Means |
| --- | --- |
| Rectangle | **External actor** — a person outside the system |
| Rounded box | **Process** — code that transforms data |
| Cylinder | **Data store** — a MySQL table or an object-storage bucket |
| Hexagon | **External service** — a third party the platform calls out to |

Arrows carry the data, not just a relationship: read the label to see what
actually moves. Teal marks the **L1 assessment** track, clay marks **L2
interview**, grey is shared infrastructure.

---

## 1 · Context — the system boundary

What crosses the edge of the platform. Two kinds of user put data in, five
external services are called out to, and everything durable lands in MySQL or S3.

```mermaid
flowchart LR
    CAND["Candidate"]
    ADMIN["Recruiter / Admin"]

    subgraph RP["RightPath platform"]
        direction TB
        SPA("React SPA<br/>browser")
        API("Spring Boot API")
    end

    DB[("MySQL 8")]
    S3[("AWS S3")]
    AI{{"OpenAI<br/>gpt-4o · whisper-1 · tts-1-hd"}}
    MAIL{{"SMTP"}}
    WA{{"Twilio WhatsApp"}}

    CAND -->|"resume, answers, code, speech, webcam"| SPA
    SPA -->|"papers, questions, results, verdicts"| CAND
    ADMIN -->|"jobs, papers, windows, pass marks"| SPA
    SPA -->|"scores, transcripts, xlsx, PDF"| ADMIN

    SPA <-->|"REST · JSON<br/>STOMP · audio frames"| API

    API <-->|"reads / writes"| DB
    API -->|"recordings, proctoring captures"| S3
    API -->|"prompts, audio, frames"| AI
    AI -->|"questions, transcript, speech, scores"| API
    API -->|"candidate mail"| MAIL
    API -->|"notifications"| WA

    classDef actor fill:#E2E8F0,stroke:#94A3B8,color:#0F172A;
    classDef proc fill:#0E6B72,stroke:#0A5057,color:#FFFFFF;
    classDef store fill:#475569,stroke:#334155,color:#FFFFFF;
    classDef ext fill:#9C4F2E,stroke:#7D3F25,color:#FFFFFF;
    class CAND,ADMIN actor;
    class SPA,API proc;
    class DB,S3 store;
    class AI,MAIL,WA ext;
```

**The one thing to notice:** the browser is not a thin client. Proctoring
decisions — face checks, tab counting, the exam clock, auto-submit — are made in
the SPA and only their *outcome* is posted to the API. The server enforces
windows, grading and interview timeouts; the browser enforces conduct.

---

## 2 · End to end — login to assessment complete

The full arc, both actors, in the order it actually happens. Three views of the
same journey: who does what and where it lands (2.1), then every call the
recruiter makes (2.2) and every call the candidate makes (2.3).

### 2.1 · Both lanes, start to finish

The handoffs are the interesting part. Neither actor ever talks to the other —
they only meet in the shared stores, which is why a stale `Application` row is
the usual cause of "the candidate says they never got the exam".

```mermaid
flowchart LR
    subgraph ADM["Recruiter / Admin"]
        direction LR
        A1("Login") --> A2("Create<br/>job post") --> A3("Review<br/>applicants") --> A4("ATS<br/>screen") --> A5("Shortlist") --> A6("Generate or<br/>upload paper") --> A7("Assign<br/>exam") --> A8("Review<br/>results") --> A9("Export")
    end

    subgraph ST["Shared state · MySQL + S3"]
        direction LR
        D1[("JobPost")]
        D2[("Application")]
        D3[("Assessment")]
        D4[("Captures<br/>S3")]
        D5[("CodeSubmission")]
        D6[("Result")]
    end

    subgraph CND["Candidate"]
        direction LR
        C1("Register /<br/>Login") --> C2("Apply +<br/>resume") --> C3("Assessment<br/>list") --> C4("Pre-exam<br/>checks") --> C5("Sit exam") --> C6("Submit") --> C7("View<br/>result")
    end

    A2 -->|"jobPrefix"| D1
    D1 -->|"shareable apply link"| C2
    C2 -->|"resumeData, APPLIED"| D2
    D2 -->|"applicant list"| A3
    A4 -->|"matchPercent,<br/>atsScanStatus"| D2
    A5 -->|"SHORTLISTED"| D2
    D2 -->|"shortlisted emails"| A7
    A7 -->|"paper, window,<br/>passPercentage"| D3
    A7 -->|"EXAM_SENT<br/>+ exam-link mail"| D2
    D3 -->|"pending papers"| C3
    C4 -->|"identity photo,<br/>room frames"| D4
    C5 -->|"per-run submissions"| D5
    C6 -->|"score, percentage,<br/>PASSED / FAILED"| D6
    C6 -->|"EXAM_COMPLETED"| D2
    D6 --> A8
    D5 --> A8
    D6 -->|"own result only"| C7

    classDef proc fill:#0E6B72,stroke:#0A5057,color:#FFFFFF;
    classDef cproc fill:#9C4F2E,stroke:#7D3F25,color:#FFFFFF;
    classDef store fill:#475569,stroke:#334155,color:#FFFFFF;
    class A1,A2,A3,A4,A5,A6,A7,A8,A9 proc;
    class C1,C2,C3,C4,C5,C6,C7 cproc;
    class D1,D2,D3,D4,D5,D6 store;
```

### 2.2 · Recruiter — login to exam assigned

Every call, in order, with the authority each one requires and what it writes.

```mermaid
sequenceDiagram
    autonumber
    actor ADM as Recruiter
    participant SPA as React SPA
    participant API as Spring Boot API
    participant DB as MySQL
    participant GPT as gpt-4o
    participant MAIL as SMTP

    rect rgb(220, 238, 240)
        Note over ADM,MAIL: Sign in
    end
    ADM->>SPA: email + password
    SPA->>API: POST /api/login
    API->>DB: verify BCrypt hash
    API->>DB: resolve roles + permissions from user_roles
    API->>DB: insert refresh_token — SHA-256 hash + sessionId
    API-->>SPA: access JWT (10 min) + httpOnly cookie (14 days)
    SPA->>API: GET /api/me
    API-->>SPA: email, roles [ADMIN], permissions[]
    Note over SPA: ProtectedRoute opens /admin/*<br/>PermissionGate hides what the token lacks

    rect rgb(220, 238, 240)
        Note over ADM,MAIL: Post the job
    end
    ADM->>SPA: title, description, skills, deadline
    SPA->>API: POST /api/jobs/post — JOB_POST_CREATE
    API->>DB: insert JobPost with unique jobPrefix
    API-->>SPA: jobPrefix
    Note over SPA: applyJobUrl(jobPrefix) → shareable link

    rect rgb(220, 238, 240)
        Note over ADM,MAIL: Screen and shortlist
    end
    SPA->>API: GET /api/job-applications/byJobPrefix/{prefix}
    API->>DB: select applications + matchPercent
    API-->>SPA: applicant rows
    ADM->>SPA: run screening
    SPA->>API: POST /api/job-applications/screen
    loop each applicant
        API->>API: Tika extract → TF-IDF + skills<br/>+ experience + education → 0–100
        API->>DB: matchPercent, atsScanStatus,<br/>shortlistStatus (≥ 60.0 threshold)
    end
    API-->>SPA: ScreeningResponseDTO
    ADM->>SPA: shortlist overrides
    SPA->>API: PATCH /api/job-applications/shortlist
    API->>DB: status = SHORTLISTED

    rect rgb(220, 238, 240)
        Note over ADM,MAIL: Paper and assignment
    end
    ADM->>SPA: generate paper
    SPA->>API: GET /api/generate-questions?jobPrefix=
    API->>DB: read JobPrompt for this job
    API->>GPT: prompt + job description
    GPT-->>API: questions + answer key
    API-->>SPA: paper (client allows 330 s)
    ADM->>SPA: window, minutes/question, pass mark
    SPA->>API: POST /api/assign — ASSESSMENT_ASSIGN
    loop each candidate
        API->>DB: insert Assessment — paper, startTime,<br/>deadline, minutesPerQuestion, passPercentage
        API->>DB: status = EXAM_SENT
        API->>MAIL: EXAM_SCHEDULE template
    end
    API-->>SPA: AssignmentReportDTO
    Note over SPA: names anyone assigned but not emailed,<br/>so the recruiter can resend
```

### 2.3 · Candidate — login to result

The same journey from the other side. Note where the browser acts alone: the
proctoring loop never round-trips, only its outcome does.

```mermaid
sequenceDiagram
    autonumber
    actor C as Candidate
    participant SPA as React SPA
    participant API as Spring Boot API
    participant DB as MySQL
    participant S3 as AWS S3
    participant ENG as CodeExecutionEngine

    rect rgb(246, 229, 220)
        Note over C,ENG: Sign in
    end
    C->>SPA: register or log in
    SPA->>API: POST /api/register or /api/login
    API->>DB: create Users row / verify BCrypt
    API-->>SPA: access JWT + httpOnly refresh cookie
    SPA->>API: GET /api/me
    API-->>SPA: roles [USER], permissions[]

    rect rgb(246, 229, 220)
        Note over C,ENG: Apply
    end
    C->>SPA: resume file + details
    SPA->>API: POST /api/job-applications/apply — JOB_APPLY
    API->>DB: insert Application — resumeData,<br/>contentType, status = APPLIED
    Note over C: waits for screening,<br/>then the exam-link mail

    rect rgb(246, 229, 220)
        Note over C,ENG: Open the assessment
    end
    SPA->>API: GET /api/getCandidateAssessments/{email}
    API->>DB: papers not expired, not attended
    API-->>SPA: pending assessments
    C->>SPA: open one → instructions screen

    rect rgb(246, 229, 220)
        Note over C,ENG: Pre-exam checks (browser-side)
    end
    SPA->>SPA: desktop check, camera grant,<br/>face present, mic noise level
    SPA->>API: POST /api/exam-proctoring/identity-photo
    API->>S3: store image
    API->>DB: insert ExamProctoringCapture — IDENTITY_PHOTO
    opt room scan enabled
        SPA->>API: POST /api/exam-proctoring/room-scan
        API->>S3: store N frames
        API->>DB: insert captures — ROOM_SCAN_FRAME
    end

    rect rgb(246, 229, 220)
        Note over C,ENG: Sit the exam
    end
    SPA->>API: GET /api/fetchAssessment/{id}
    API-->>SPA: paper + timing
    SPA->>API: POST /api/markExamAttended
    API->>DB: examAttended = true
    Note over SPA: clock = questionCount × minutesPerQuestion<br/>fullscreen locked, tab switches counted,<br/>face checked on an interval

    opt coding paper — repeats per run
        C->>SPA: write code, press Run
        SPA->>API: POST /api/compiler/run — COMPILER_RUN
        API->>ENG: compile once, run every case (45 s budget)
        ENG-->>API: per-case ExecutionStatus + executionTimeMs
        API->>DB: upsert CodeSubmission + TestResultEntity
        API-->>SPA: results per test case
    end

    rect rgb(246, 229, 220)
        Note over C,ENG: Submit and grade
    end
    alt candidate presses Submit
        SPA->>SPA: buildSubmissionMeta → mode MANUAL
    else timer expires or proctoring limit hit
        SPA->>SPA: buildSubmissionMeta → mode AUTO + reason
    end
    SPA->>API: POST /api/result — answers in body,<br/>score · totalMarks · percentage ·<br/>assessmentId as query params
    API->>DB: insert Result — percentage ≥ passPercentage<br/>→ PASSED / FAILED
    API->>DB: Assessment.examAttended = true
    API->>DB: Application.status = EXAM_COMPLETED
    API-->>SPA: saved

    rect rgb(246, 229, 220)
        Note over C,ENG: See the outcome
    end
    SPA->>API: GET /api/get-results?email=&jobPrefix=
    API-->>SPA: Result rows
    Note over SPA: same result.utils maths as the admin view,<br/>so both sides quote identical numbers
```

**Four details worth carrying out of this section:**

- **Login is two calls, not one.** `POST /api/login` mints the tokens;
  `GET /api/me` is what supplies roles and permissions. On a reload there is a
  third path — `AuthProvider` refreshes first, *then* calls `/me`, so routes
  never evaluate against an empty permission list.
- **The exam clock is derived at load, not stored.** `questionCount ×
  minutesPerQuestion`, with the assignment's override winning. Nothing on the
  server counts down; the browser owns the clock and the server owns the window.
- **`assessmentId` on submit is not optional in practice.** A re-assigned exam
  leaves several rows of the same type for one candidate, and only the id says
  which attempt this result belongs to.
- **Coding submissions are written during the exam, not at submit.** Every Run
  upserts. If a candidate never presses Submit, the code is still there — which
  is what makes an auto-submitted or abandoned attempt reviewable.

---

## 3 · L1 — assessment data flow

From a resume arriving to a graded result leaving as a workbook. Seven
processes, five stores.

```mermaid
flowchart TB
    CAND["Candidate"]
    ADMIN["Recruiter"]

    APPLY("1 · Apply")
    SCREEN("2 · ATS screen")
    ASSIGN("3 · Assign exam")
    EXAM("4 · Sit exam<br/>proctored, timed")
    RUN("5 · Run code")
    GRADE("6 · Grade")
    EXPORT("7 · Export")

    APP[("Application")]
    ASMT[("Assessment")]
    CAP[("ExamProctoringCapture<br/>+ S3 object")]
    SUB[("CodeSubmission<br/>+ TestResultEntity")]
    RES[("Result")]

    GPT{{"gpt-4o"}}
    ENGINE{{"CodeExecutionEngine<br/>javac · python3 · node · gcc · g++"}}

    CAND -->|"resume file + details"| APPLY
    APPLY -->|"resumeData, contentType,<br/>status = APPLIED"| APP

    APP -->|"resume text + job description"| SCREEN
    SCREEN -->|"matchPercent, atsScanStatus,<br/>shortlistStatus"| APP

    ADMIN -->|"window, minutes/question,<br/>passPercentage"| ASSIGN
    APP -->|"shortlisted emails"| ASSIGN
    GPT -->|"generated paper + answer key"| ASSIGN
    ASSIGN -->|"one row per candidate:<br/>paper, startTime, deadline"| ASMT
    ASSIGN -->|"status = EXAM_SENT"| APP

    ASMT -->|"paper, timing, pass mark"| EXAM
    EXAM -->|"identity photo, room frames"| CAP
    EXAM -->|"examAttended = true"| ASMT

    EXAM -->|"script + language"| RUN
    RUN -->|"compile once, run every case"| ENGINE
    ENGINE -->|"per-case ExecutionStatus,<br/>executionTimeMs"| RUN
    RUN -->|"script, answersJson,<br/>passed, attempted"| SUB

    EXAM -->|"answers, score, totalMarks,<br/>percentage, __submissionMeta"| GRADE
    GRADE -->|"percentage ≥ passPercentage<br/>→ PASSED / FAILED"| RES
    GRADE -->|"status = EXAM_COMPLETED"| APP

    RES --> EXPORT
    SUB --> EXPORT
    CAP --> EXPORT
    EXPORT -->|"xlsx workbook, PDF answer sheet"| ADMIN

    classDef actor fill:#E2E8F0,stroke:#94A3B8,color:#0F172A;
    classDef proc fill:#0E6B72,stroke:#0A5057,color:#FFFFFF;
    classDef store fill:#475569,stroke:#334155,color:#FFFFFF;
    classDef ext fill:#9C4F2E,stroke:#7D3F25,color:#FFFFFF;
    class CAND,ADMIN actor;
    class APPLY,SCREEN,ASSIGN,EXAM,RUN,GRADE,EXPORT proc;
    class APP,ASMT,CAP,SUB,RES store;
    class GPT,ENGINE ext;
```

**Three things the diagram makes visible that prose hides:**

- **The `Application` row is written by four different processes.** Apply, ATS
  screen, Assign and Grade each move it forward. That is why the status enum and
  the per-stage string flags have to be kept in step by
  `StatusTransitionValidator` — four writers, one ladder.
- **`percentage` travels with `score`, not instead of it.** The exam page
  computes the percentage and sends both; grading compares the percentage
  against `passPercentage`. Grading raw marks failed papers that had passed.
- **Code execution is a side loop, not a stage.** A candidate can run code many
  times; only the submission is stored. The exam clock keeps running throughout.

---

## 4 · L2 — interview data flow

The realtime loop, one turn of conversation. Audio in on the left, speech out on
the right, with three stores accumulating the record as it goes.

```mermaid
flowchart TB
    subgraph BROWSER["Candidate browser"]
        direction TB
        MIC["Microphone"]
        MEDIA["Webcam + screen"]
        UI("Interview UI")
    end

    subgraph SERVER["Spring Boot API"]
        direction TB
        WS("STOMP handler<br/>verifyOwnership per message")
        TRANS("Transcribe")
        CTX("Build context")
        GEN("Generate reply")
        SPEAK("Synthesise speech")
        EVAL("Evaluate")
    end

    WHISPER{{"whisper-1"}}
    GPT{{"gpt-4o streaming"}}
    TTSM{{"tts-1-hd · nova"}}

    CONV[("VoiceConversationEntry")]
    SCHED[("CandidateInterviewSchedule")]
    PROC[("ProctoringEvent")]
    S3[("AWS S3")]

    MIC -->|"4 s chunks, base64 over STOMP<br/>max 200 KB"| WS
    WS --> TRANS
    TRANS --> WHISPER
    WHISPER -->|"transcript"| TRANS
    TRANS -->|"/topic/…/transcription"| UI
    TRANS -->|"role CANDIDATE, wordCount, WPM,<br/>fillerWordCount, confidenceScore"| CONV

    CONV -->|"last 4 turns"| CTX
    SCHED -->|"phase, difficultyLevel,<br/>runningSummary"| CTX
    CTX --> GEN
    GEN --> GPT
    GPT -->|"streamed tokens"| GEN
    GEN -->|"/topic/…/ai-token<br/>then response-complete"| UI
    GEN -->|"role INTERVIEWER"| CONV
    GEN -->|"phase, difficulty,<br/>question counters, summary"| SCHED

    GEN --> SPEAK
    SPEAK --> TTSM
    TTSM -->|"audio"| SPEAK
    SPEAK -->|"/topic/…/tts-audio<br/>fallback if unavailable"| UI

    MEDIA -->|"15 s video / screen chunks"| S3
    S3 -->|"object keys"| SCHED
    UI -->|"face, tab, devtools events"| PROC
    PROC -->|"warningCount"| SCHED

    CONV --> EVAL
    SCHED -->|"EvaluationCategory weights"| EVAL
    EVAL --> GPT
    EVAL -->|"evaluationJson, interviewResult,<br/>completionReason"| SCHED

    classDef actor fill:#E2E8F0,stroke:#94A3B8,color:#0F172A;
    classDef proc fill:#9C4F2E,stroke:#7D3F25,color:#FFFFFF;
    classDef store fill:#475569,stroke:#334155,color:#FFFFFF;
    classDef ext fill:#0E6B72,stroke:#0A5057,color:#FFFFFF;
    class MIC,MEDIA actor;
    class UI,WS,TRANS,CTX,GEN,SPEAK,EVAL proc;
    class CONV,SCHED,PROC,S3 store;
    class WHISPER,GPT,TTSM ext;
```

**What the loop turns on:**

- **`runningSummary` is the reason this scales.** Only the last four turns plus a
  rolling summary go to the model. Without it, every turn would resend the whole
  interview and the context window would decide when the interview ends.
- **`CandidateInterviewSchedule` is both input and output of the same turn.** It
  supplies phase and difficulty, then is written back with the updated ones.
  That feedback edge is the adaptive difficulty.
- **Every inbound message re-checks ownership.** The handshake authenticates
  once; `verifyOwnership` runs per message, so a socket cannot be steered at
  another candidate's `scheduleId` after connecting.

---

## 5 · Authentication — the token exchange

Not a data flow so much as a data *hazard*: the server treats a reused refresh
token as theft and revokes the whole session, so the client must never spend the
cookie twice. This is what stops two tabs doing exactly that.

```mermaid
sequenceDiagram
    autonumber
    participant A as Tab A
    participant B as Tab B
    participant L as Web Locks<br/>(origin-wide)
    participant API as Spring Boot API
    participant DB as refresh_token

    A->>API: POST /api/login
    API->>DB: store SHA-256 hash + sessionId
    API-->>A: access JWT (10 min)<br/>+ httpOnly cookie (14 days)
    Note over A: access token persisted to localStorage<br/>so a reload spends no rotation

    A->>API: GET /api/… with Bearer token
    API-->>A: 401 — access token expired

    A->>L: acquire "rightpath_auth_refresh"
    B->>L: acquire — queued behind A
    A->>API: POST /api/refresh (cookie)
    API->>DB: revoke old row,<br/>insert successor, link replacedByTokenId
    API-->>A: new access token + rotated cookie
    A->>L: release
    L-->>B: granted
    Note over B: reads the token A just stored —<br/>fresh, so no second rotation is spent

    rect rgb(160, 60, 60)
        Note over A,DB: If a rotated token is ever presented again,<br/>RefreshTokenService.rotate revokes the entire<br/>session chain — not just that token.
    end
```

**Why the lock exists at all.** Three separate mechanisms could each spend a
rotation: the startup bootstrap, the 401 retry path, and a second tab waking up.
Under React StrictMode the bootstrap alone ran twice. The single-flight promise
serialises the first two; the Web Locks lock is origin-wide and serialises the
third. Persisting the access token removes the need for most refreshes in the
first place.

---

## 6 · What one exam submission writes

The narrowest useful view: a candidate presses Submit once, and four rows change
across three tables. Worth having when debugging a result that looks wrong.

```mermaid
flowchart LR
    SUBMIT("POST /api/result<br/>answers in body,<br/>score · totalMarks · percentage<br/>· assessmentId in query")

    R1[("Result<br/>new row")]
    A1[("Assessment<br/>examAttended = true")]
    P1[("Application<br/>status = EXAM_COMPLETED")]
    C1[("CodeSubmission<br/>written earlier, per run")]

    SUBMIT -->|"score, totalMarks,<br/>percentage, status,<br/>resultsJson + __submissionMeta"| R1
    SUBMIT -->|"marks the paper sat"| A1
    SUBMIT -->|"advances the funnel"| P1
    C1 -.->|"joined at read time<br/>by email + jobPrefix"| R1

    classDef proc fill:#0E6B72,stroke:#0A5057,color:#FFFFFF;
    classDef store fill:#475569,stroke:#334155,color:#FFFFFF;
    class SUBMIT proc;
    class R1,A1,P1,C1 store;
```

**The dashed edge is the subtle one.** Coding submissions are written during the
exam, one per run, and are *not* referenced by the `Result` row. The results
screen joins them at read time on email plus `jobPrefix`. That is why a
re-assigned exam needs `assessmentId` passed explicitly on submit — several rows
of the same type exist, and only the id says which attempt this result belongs
to.

---

## Keeping this current

| If you changed… | Update |
| --- | --- |
| A new external service, or one removed | Section 1 |
| The order of calls on login, apply, assign or exam entry | Section 2 — all three views |
| An L1 stage, or what a stage writes | Sections 2 and 3 |
| The interview turn, context window, or evaluation inputs | Section 4 |
| Token lifetime, rotation or the locking strategy | Sections 2.2/2.3 and 5 |
| The submit payload or what it writes | Sections 2.3 and 6 |

Edge labels name real fields. When a column is renamed, the label is wrong until
it is changed here too — that is the point of naming them rather than writing
"saves data".
