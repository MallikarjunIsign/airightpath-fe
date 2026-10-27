# Exam capture & per-question timing — contract reference

Both features are live on the backend. This is the contract the frontend codes
against, kept as a reference for anyone changing either side.

---

## 1. Identity photo

Taken on the exam instructions screen before the candidate can start. The
frontend enforces that a face is present and that only one person is in frame at
the moment of capture.

```
POST /api/exam-proctoring/identity-photo   (multipart/form-data)
```

| Field            | Type   | Notes                                       |
| ---------------- | ------ | ------------------------------------------- |
| `assessmentId`   | string | The assessment about to be attempted        |
| `candidateEmail` | string | Logged-in candidate; must match the caller  |
| `capturedAt`     | string | ISO-8601, client clock (optional)           |
| `photo`          | file   | JPEG, longest edge 640 px, roughly 30–80 KB |

Re-taking replaces the photo held for that attempt.

**Requiring the photo means requiring it to be stored.** There is no mode where
the step is asked for but a failed upload is accepted — a photo sitting in a
browser tab is not evidence of who sat the exam. On failure the candidate sees
"We couldn't save your photo. Please try again." and a retry that re-sends the
shot they already took; the exam does not start until it lands.

## 2. Room scan

A guided sweep: eight frames over ~16 seconds while the candidate turns their
camera through a full circle.

```
POST /api/exam-proctoring/room-scan   (multipart/form-data)
```

| Field            | Type       | Notes                         |
| ---------------- | ---------- | ----------------------------- |
| `assessmentId`   | string     |                               |
| `candidateEmail` | string     |                               |
| `capturedAt`     | string     | ISO-8601                      |
| `frames`         | file (× N) | Repeated field, JPEG, ordered |

Frame count and duration are client-configured, so the endpoint accepts a
variable number of parts rather than assuming eight.

Whether the scan happens is an environment decision, not the candidate's:
`VITE_PROCTORING_ROOM_SCAN_REQUIRED=true` shows the step and blocks the exam
start until it is stored; `false` leaves it out of the check entirely. There is
no skippable middle state.

## 3. Reading captures back (admin)

All three require `ASSESSMENT_READ`:

```
GET /api/exam-proctoring/assessments/{assessmentId}/captures
GET /api/exam-proctoring/captures?candidateEmail=&jobPrefix=
GET /api/exam-proctoring/captures/{captureId}/image
```

The listing returns `ProctoringCaptureDto` in an `ApiResponse` envelope —
`captureType` is `IDENTITY_PHOTO` or `ROOM_SCAN_FRAME`, and `frameIndex` orders a
sweep. Bytes are not inlined; `imageUrl` points at the image endpoint.

Because that endpoint is authenticated and the access token lives in memory
rather than a cookie, the admin console fetches each image as a blob and renders
it from an object URL. A plain `<img src>` would arrive unauthenticated.

## 4. Per-question exam timing

The exam clock is `questionCount × minutesPerQuestion`, defaulting to **1 minute
per aptitude question** and **25 minutes per coding problem**. Admins override
the allowance per assignment on the Assign Assessment screen.

**Assign request** (`POST /api/assign`, multipart) carries, per type assigned:

| Field                              | Persisted | Meaning                                    |
| ---------------------------------- | --------- | ------------------------------------------ |
| `aptitudeMinutesPerQuestion`       | yes       | **Authoritative** — minutes per question   |
| `codingMinutesPerQuestion`         | yes       | Same, for the coding paper                 |
| `*QuestionCount`                   | no        | Informational; counted from the paper      |
| `*EstimatedDurationMinutes`        | no        | Informational; count × minutes at assign   |

The count and estimate are for reporting only. The frontend recomputes the real
duration from the stored paper when the exam opens, so a mistyped count at
assign time cannot shorten a candidate's exam.

**Assessment responses** (`/api/getCandidateAssessments/{email}`,
`/api/assessment-content/{id}`) return `minutesPerQuestion` and an optional
`durationMinutes` fixed override that wins outright. Both are omitted for rows
assigned before this existed, and the frontend falls back to the configured
default for the assessment type.

---

## Configuration reference

Frontend switches, all optional, with the defaults shown:

| Env var                                 | Default | Effect                                      |
| --------------------------------------- | ------- | ------------------------------------------- |
| `VITE_PROCTORING_PHOTO_REQUIRED`        | `true`  | Show the identity photo step and require it |
| `VITE_PROCTORING_PHOTO_MAX_WIDTH`       | `640`   | Longest edge of the stored image            |
| `VITE_PROCTORING_ROOM_SCAN_REQUIRED`    | `false` | Show the room scan and require it           |
| `VITE_PROCTORING_ROOM_SCAN_FRAMES`      | `8`     | Frames captured across the sweep            |
| `VITE_PROCTORING_ROOM_SCAN_DURATION_MS` | `16000` | Time given for the full turn                |
| `VITE_PROCTORING_NOISE_ENABLED`         | `true`  | Show the background-noise meter             |
| `VITE_PROCTORING_NOISE_WARN_DB`         | `-45`   | dBFS at which the meter turns amber         |
| `VITE_PROCTORING_NOISE_BLOCK_DB`        | `-32`   | dBFS at which it turns red                  |
| `VITE_PROCTORING_NOISE_SUSTAIN_MS`      | `1500`  | How long it must stay loud to read red      |
| `VITE_PROCTORING_NOISE_BLOCKS_START`    | `true`  | Whether red actually blocks the start       |
