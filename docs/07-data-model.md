# 07 — Data Model

MySQL 8, Hibernate-managed (`ddl-auto=update` on every profile). There is no
Flyway or Liquibase — schema changes are hand-recorded under
`backend/docs/migrations/`.

Entities live in `src/main/java/com/rightpath/entity` (26 classes), enums in
`enums` (17).

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
 ├─< Assessment             by job_prefix
 ├─< Result                 by job_prefix
 └─< CandidateInterviewSchedule

Assessment ──1:1── Result
Assessment ──<   ExamProctoringCapture   (identity photo, room scan frames)
```

`jobPrefix` — not the numeric job id — is the join key across assessments,
results, prompts, categories and interviews.

---

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

### `Role` — table `roles`
`id`, `name` (`RoleName`, unique, varchar(50)), `permissions` — many-to-many to
`Permission`.

### `Permission` — table `permissions`
`id`, `name` (`PermissionName`, unique, varchar(100)).

### `UserRole` — table `user_roles`
`id`, `user` → `users.email`, `role` → `roles.id` (eager), `active` boolean.
A join entity rather than a plain join table so a role can be deactivated
without being deleted.

### `RefreshToken`
`id` (UUID), `userEmail`, `sessionId` (UUID), `tokenHash` (SHA-256, unique,
64 chars — the raw token is never stored), `createdAt`, `lastUsedAt`,
`expiresAt`, `revokedAt`, `replacedByTokenId`, `ipAddress`, `userAgent`.
`replacedByTokenId` is what makes rotation auditable and reuse detectable.

### `Otp` — table `OTP`
`id`, `email`, `mobile`, `otp`, `expirationTime`. Purged every 5 minutes.

---

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
`user` → `users.email`, `jobPost` → `job_prefix`, `status`
(`ApplicationStatus`), `examDate`, `examTime`, `createdAt`, `updatedAt`.

Plus per-stage string flags that drive the admin table's column badges:
`atsScanStatus`, `shortlistStatus`, `confirmationStatus`, `acknowledgedStatus`,
`reconfirmationStatus`, `examLinkStatus`, `examCompletedStatus`,
`rejectionStatus`, `writtenTestStatus`, `interview`.

> Two parallel representations of progress — the `status` enum and the flags —
> are kept in step by `StatusTransitionValidator`. Update both when adding a
> stage.

---

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
| `adminComments` | |
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

### `Question` / `QuestionType`
`id`, `title`, `description` (2000), `questionType`, `expectedOutput` (`TEXT`).

### `CodeSubmission`
`id`, `language`, `script` (10000), `userEmail`, `jobPrefix`, `questionId`,
`assessmentId`, `createdAt`, `passed`, `attempted`, `answersJson` (`TEXT`),
`testResults` (one-to-many).

### `TestResultEntity`
`id`, `input`, `expectedOutput`, `actualOutput` (all `@Lob`), `testCasesJson`,
`passed`, `status` (32), `errorMessage` (`TEXT`), `executionTimeMs`,
`questionId`, `submission`.

### `TestCase`
Value type: `input`, `expectedOutput`, `passed`.

### `ExamProctoringCapture`
`id`, `assessmentId`, `candidateEmail`, `jobPrefix`, `captureType`
(`IDENTITY_PHOTO` / `ROOM_SCAN_FRAME`), `frameIndex`, `containerName`,
`fileName`, `contentType`, `sizeBytes`, `capturedAt`, `uploadedAt`.
Image bytes live in object storage, not in MySQL.

---

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
| `recordReferences`, `screenRecordReferences`, `summaryReferences` | `TEXT`, S3 keys (note the column is spelled `summery_references`) |
| `conversationEntries`, proctoring events | one-to-many, cascade |

### `VoiceConversationEntry`
`id`, `interviewSchedule`, `role` (`SYSTEM` / `INTERVIEWER` / `CANDIDATE`),
`content` (`TEXT`), `timestamp`, plus delivery metrics: `wordCount`,
`wordsPerMinute`, `fillerWordCount`, `confidenceScore`,
`speechDurationSeconds`, and for coding answers `codeContent` + `codeLanguage`.

### `ProctoringEvent`
`id`, `schedule`, `eventType`, `details` (`TEXT`), `timestamp`.

### `InterviewQuestion` — table `interview_question`
`id`, `interviewScheduleId`, `uniqueId`, `level`, `questionText` (`TEXT`),
`count`.

### `UploadInterviewQuestions`
`id`, `jobPrefix`, `fileName`, `language`.

### `InterviewSession`
In-memory only (not an entity): `jobPrefix`, `email`, `messages`, `lastAnswer`,
`completed`, `questions`, `currentQuestionIndex`, `resumeSummary`, `qaHistory`,
`retryUsed`.

### `RoomVerificationSession` — table `room_verification_sessions`
`id`, `sessionId` (unique), `status` (`VerificationStatus`), `reason`,
`imageUrl`, `createdAt`, `verifiedAt`.

---

## Configuration entities

### `JobPrompt`
`id`, `jobPrefix`, `promptType`, `promptStage`, `prompt` (`TEXT`), `jobPost`,
`createdAt`, `updatedAt`. Unique on `(job_prefix, prompt_type, prompt_stage)`.

### `EvaluationCategory`
`id`, `jobPrefix`, `categoryName`, `weight`, `description`, `createdAt`,
`updatedAt`. Unique on `(job_prefix, category_name)`. The weights drive the
interview score.

---

## Enums

| Enum | Values |
| --- | --- |
| `ApplicationStatus` | `APPLIED`, `SHORTLISTED`, `ACKNOWLEDGED`, `ACKNOWLEDGED_BACK`, `RECONFIRMED`, `EXAM_SENT`, `EXAM_COMPLETED`, `INTERVIEW_SCHEDULED`, `INTERVIEW_COMPLETED`, `SELECTED`, `REJECTED` |
| `AssessmentType` | `APTITUDE`, `CODING` |
| `ResultStatus` | `PASSED`, `FAILED` |
| `ExecutionStatus` | `PASSED`, `WRONG_ANSWER`, `COMPILE_ERROR`, `RUNTIME_ERROR`, `TIMEOUT`, `OUTPUT_LIMIT_EXCEEDED`, `NOT_RUN`, `INTERNAL_ERROR` |
| `ProctoringCaptureType` | `IDENTITY_PHOTO`, `ROOM_SCAN_FRAME` |
| `AttemptStatus` | `NOT_ATTEMPTED`, `IN_PROGRESS`, `COMPLETED` |
| `InterviewStatus` | `ACTIVE`, `IN_PROGRESS`, `COMPLETED` |
| `InterviewResult` | `PASSED`, `FAILED`, `PENDING` |
| `InterviewPhase` | `INTRODUCTION`(3 min/2 q), `BACKGROUND`(8/3), `TECHNICAL`(20/6), `PROBLEM_SOLVING`(12/3), `BEHAVIORAL`(10/3), `CLOSING`(5/1) |
| `CompletionReason` | `NATURAL_COMPLETION`, `EARLY_TERMINATION_POOR_PERFORMANCE`, `CANDIDATE_ENDED`, `PROCTORING_VIOLATION`, `TIMEOUT`, `MAX_SKIPS` |
| `ConversationRole` | `SYSTEM`, `INTERVIEWER`, `CANDIDATE` |
| `VerificationStatus` | `PENDING`, `VERIFIED`, `FAILED` |
| `ReferralStatus` | `PENDING`, `VERIFIED`, `REJECTED` |
| `PromptType` | `APTITUDE`, `CODING`, `INTERVIEW` |
| `PromptStage` | `START`, `SUMMARY` |
| `JobStatusFilter` | `ACTIVE`, `EXPIRED`, `ALL` |
| `EmailType` | `APPLICATION_SUCCESS`, `ACKNOWLEDGEMENT`, `ACKNOWLEDGEMENT_CONFIRMATION`, `RECONFIRMATION`, `REJECTION`, `WRITTEN_TEST_SUCCESS`, `WRITTEN_TEST_FAILURE`, `SHORTLIST_NOTIFICATION`, `EXAM_SCHEDULE`, `INTERVIEW_SCHEDULE`, `OTP`, `PASSWORD_UPDATED`, `EXAM_SUBMISSION`, `CODING_EXAM_SUBMISSION`, `REGISTRATION_SUCCESS` |

Frontend mirrors of these types live in [`src/types/`](../src/types/) —
`assessment.types.ts`, `result.types.ts`, `interview.types.ts`,
`compiler.types.ts`, `proctoring.types.ts`, `job.types.ts`, `user.types.ts`,
`auth.types.ts`, `api.types.ts`. Keep them in step when an enum changes.

## Where binary data lives

| Data | Storage |
| --- | --- |
| Profile image | MySQL `LONGBLOB` |
| Resume | MySQL `@Lob` + `contentType` |
| Answer key | MySQL `@Lob` |
| Question paper | MySQL `TEXT`, or object storage via `containerName`/`fileName` |
| Exam proctoring captures | Object storage, row keeps the reference |
| Interview video / screen recordings | S3, keys on the schedule |
