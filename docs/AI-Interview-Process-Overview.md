# RightPath AI Voice Interview - Complete Process Overview

## What is this?

RightPath is an AI-powered interview platform where candidates have a real-time voice conversation with an AI interviewer (named "Sarah" by default). The entire process is automated - from scheduling, to conducting the interview, to evaluating the candidate and generating results.

---

## The Big Picture (Simple Flow)

```
Admin schedules interview for a candidate
         |
         v
Candidate opens the interview page
         |
         v
Pre-interview checks (mic, camera, instructions)
         |
         v
Candidate clicks "Start Interview"
         |
         v
AI asks the first question (voice + text)
         |
         v
Candidate speaks their answer (voice recorded)
         |
         v
AI listens, processes, and asks the next question
         |
         v
This continues for multiple questions (~60 min max)
         |
         v
Interview ends (naturally or by candidate/system)
         |
         v
AI generates a detailed evaluation report
         |
         v
Admin reviews results, scores, and recordings
```

---

## Step-by-Step Process

### Step 1: Admin Schedules the Interview

**What happens:** An admin user goes to the Interview Scheduler page, selects a job posting, picks candidate(s), sets a deadline, and assigns the interview.

**Behind the scenes:**
- Frontend calls `POST /api/interview/assign-interview` (single) or `POST /api/interview/assign-interview-bulk` (multiple candidates)
- Backend creates a `CandidateInterviewSchedule` record in the database with status `NOT_ATTEMPTED`
- Optionally sends an email notification to the candidate(s)

**Key data stored:**
- Job prefix (which job the interview is for, e.g., "JAVA-2024")
- Candidate email
- Assigned date and deadline
- Status: `NOT_ATTEMPTED`

---

### Step 2: Candidate Opens the Interview Page

**What happens:** The candidate logs in, sees their scheduled interview in the Interview List page, and clicks to start it.

**Behind the scenes:**
- Frontend calls `GET /api/interview/active?email=candidate@email.com`
- Returns all active (not yet completed) interviews for that candidate
- Candidate navigates to the Interview Page

---

### Step 3: Pre-Interview Setup (Instruction Screen)

**What happens:** Before the interview starts, the candidate sees:
- Interview instructions (also read aloud by browser text-to-speech)
- A 60-second countdown timer (must wait before starting)
- Permission checks for microphone and camera
- Proctoring rules explanation

**Why 60 seconds?** This ensures the candidate actually reads the instructions before starting.

**Proctoring rules shown:**
- No tab switching
- No multiple faces / no face absent
- No exiting fullscreen
- No opening developer tools
- Maximum 5 warnings allowed before auto-termination

---

### Step 4: Interview Starts

**What happens when candidate clicks "Start Interview":**

1. **Browser enters fullscreen mode** (required for proctoring)
2. **Face detection models are loaded** (using face-api.js library)
3. **REST API call** to `POST /api/interview/voice/start` with jobPrefix and email
4. **Backend processes the start:**
   - Finds the interview schedule in the database
   - Changes status from `NOT_ATTEMPTED` to `IN_PROGRESS`
   - Records the start time
   - Fetches the interview system prompt from the database (customizable per job)
   - Calls **OpenAI GPT-4o** to generate the first interview question
   - Saves the first question to the conversation log
   - Calls **OpenAI TTS (tts-1-hd, voice: nova)** to convert the question to speech audio
   - Returns: schedule ID, first question text, first question audio (base64 MP3), interviewer name
5. **WebSocket connection is established** (STOMP over SockJS) at `/ws?token=JWT_TOKEN`
6. **Video recording starts** (for proctoring - the recording is uploaded at the end)
7. **Face detection starts** (continuously monitors the video feed)
8. **Global 60-minute timer starts**
9. **AI speaks the first question** (MP3 audio played through Web Audio API)

---

### Step 5: Candidate Answers a Question

**What happens when the candidate clicks the microphone button:**

1. **Audio recording starts** using MediaRecorder API
   - Audio format: `audio/webm;codecs=opus`
   - Every 4 seconds, the audio chunk is:
     - Encoded to base64
     - Sent via WebSocket to `/app/interview/{scheduleId}/audio-chunk`

2. **Real-time transcription on the backend:**
   - Each audio chunk is received by `VoiceInterviewWebSocketController`
   - Sent to **OpenAI Whisper API** (model: `whisper-1`) for transcription
   - Whisper returns: transcribed text + word-level timestamps
   - Result is sent back to frontend via WebSocket topic `/topic/interview/{scheduleId}/transcription`
   - Frontend shows the live transcription on screen in real-time

3. **Candidate sees their words appearing on screen as they speak**

4. **When candidate clicks STOP (or time runs out):**
   - Recording stops, final audio chunk is flushed
   - Frontend waits briefly for the final transcription to arrive
   - Complete transcript + word timestamps are sent via WebSocket to `/app/interview/{scheduleId}/submit-answer`

---

### Step 6: AI Processes the Answer and Asks Next Question

**What happens after the answer is submitted:**

1. **Tone Analysis** is performed on the answer:
   - Word count, words per minute
   - Filler word detection (um, uh, like, you know, basically, etc.)
   - Pause analysis (from word timestamps)
   - Confidence score calculated (0-100) based on pace, fillers, pauses, answer length

2. **Candidate's answer is saved** to the `VoiceConversationEntry` table with all metrics

3. **A "filler" message is sent** to the frontend (e.g., "That's a great point, let me think about what I'd like to explore next...") so the candidate doesn't feel like nothing is happening

4. **Running summary is updated** (if there are more than 8 conversation entries):
   - Older conversation entries are summarized by GPT-4o
   - This prevents the context window from getting too large
   - Summary is saved to the schedule record

5. **Performance analysis** is done:
   - Checks skip ratio, consecutive skips, average word count, confidence score
   - If the candidate is performing very poorly, a hidden guidance message is injected into the AI's context suggesting it may wrap up early

6. **GPT-4o generates the next question:**
   - Uses the system prompt (from database, customizable per job)
   - Includes running summary of earlier conversation
   - Includes the last 4 Q&A pairs verbatim (rolling context window)
   - Includes performance guidance if candidate is struggling
   - Response is **streamed token-by-token** via SSE (Server-Sent Events) from OpenAI
   - Each token is sent to frontend via WebSocket topic `/topic/interview/{scheduleId}/ai-token`
   - Frontend shows the response appearing word by word

7. **When the AI's full response is ready:**
   - It's saved to the conversation log
   - A "response-complete" message is sent to frontend
   - The response text is **converted to speech** using OpenAI TTS API:
     - Text is split into batches of 2-3 sentences
     - Each batch is converted to MP3 audio
     - Audio chunks are sent via WebSocket topic `/topic/interview/{scheduleId}/tts-audio`
   - Frontend plays the audio chunks sequentially through Web Audio API
   - If TTS fails, browser's built-in speech synthesis is used as fallback

8. **The cycle repeats** - candidate listens, answers, AI responds

---

### Step 7: Interview Can End in Several Ways

| How it ends | What triggers it | Completion Reason |
|---|---|---|
| **Natural completion** | AI decides it has asked enough questions and includes `[INTERVIEW_COMPLETE]` in its response | `NATURAL_COMPLETION` |
| **Candidate ends it** | Candidate clicks "End Interview" button | `CANDIDATE_ENDED` |
| **Time runs out** | 60-minute global timer expires | `TIMEOUT` |
| **Proctoring violation** | Candidate exceeds 5 proctoring warnings | `PROCTORING_VIOLATION` |
| **Poor performance** | AI decides to end early due to consistently poor answers | `EARLY_TERMINATION_POOR_PERFORMANCE` |
| **Backend timeout** | Interview is IN_PROGRESS for >60 min (scheduled check every 5 min) | `TIMEOUT` |

**When the interview ends:**
1. Interview status changes to `COMPLETED`
2. End time is recorded
3. Video recording is stopped and uploaded to **AWS S3**
4. Frontend redirects to the interview list page
5. **Evaluation is triggered asynchronously** (see next step)

---

### Step 8: AI Generates Evaluation Report

**What happens (runs automatically in the background):**

1. The full conversation transcript is compiled
2. Evaluation categories are loaded from the database (customizable per job)
3. A detailed evaluation prompt is sent to **GPT-4o** asking it to produce:
   - Overall score (0-10)
   - Recommendation: STRONG_HIRE / HIRE / LEAN_HIRE / LEAN_NO_HIRE / NO_HIRE
   - Summary (2-3 sentences)
   - Strengths (list)
   - Areas for improvement (list)
   - Category scores (e.g., Technical Knowledge: 7/10, Communication: 8/10, etc.)
4. **Speech analysis** is calculated from the stored conversation metrics:
   - Average words per minute
   - Total filler words
   - Confidence score
   - Pace assessment
   - Articulation feedback
5. Based on the recommendation:
   - STRONG_HIRE, HIRE, or LEAN_HIRE = **PASSED**
   - LEAN_NO_HIRE or NO_HIRE = **FAILED**
6. Everything is saved to the database

---

### Step 9: Admin Reviews Results

**What the admin sees on the Interview Results page:**

1. **Dashboard stats:** Total interviews, pass rate, average score, average duration
2. **Results table:** All candidates with status, result, score, duration, warnings, recommendation
3. **Detail modal (4 tabs):**
   - **Evaluation tab:** Overall score, recommendation, category breakdown, speech analysis, strengths, areas for improvement
   - **Conversation tab:** Full Q&A transcript with timestamps and WPM per answer
   - **Proctoring tab:** Timeline of all proctoring events (tab switches, face warnings, etc.)
   - **Recording tab:** Video playback of the interview session
4. **CSV export** of all results

---

## What Happens During Proctoring

The system monitors the candidate throughout the interview:

| Check | How it works | Warning trigger |
|---|---|---|
| **Tab switching** | `document.visibilitychange` event | Any tab switch/minimize |
| **Face detection** | face-api.js analyzing webcam every 2 seconds | No face detected, multiple faces, looking away |
| **Fullscreen** | Fullscreen API monitoring | Exiting fullscreen mode |
| **Developer tools** | Window size heuristic detection every 1 second | Opening DevTools |

- Each violation sends a WebSocket message to the backend
- Backend saves the event to the `ProctoringEvent` table
- Backend increments the warning counter
- At 5 warnings: interview is auto-terminated with result = FAILED

---

## Room Verification (Pre-Interview Check)

Before starting, there's an optional room verification step:
1. Frontend captures a photo from the webcam
2. Photo is sent to `POST /api/interview/verify-room`
3. Backend sends the image to **OpenAI GPT-4o Vision API** which checks:
   - Is exactly ONE person visible?
   - Is the person sitting in front of a computer?
   - Are other people visible?
4. Returns VERIFIED or FAILED with a reason

---

## AI Models Used

| Model | Purpose | Where configured |
|---|---|---|
| **GPT-4o** | Generating interview questions, evaluating answers, generating evaluation reports, running summaries, room verification | `openai.model=gpt-4o` in application-dev.properties |
| **Whisper-1** | Converting candidate's speech to text (real-time transcription) | `openai.audio.model=whisper-1` in application-dev.properties |
| **TTS-1-HD** | Converting AI interviewer's text responses to speech audio (voice: "nova") | `openai.tts.model=tts-1-hd` and `openai.tts.voice=nova` in application-dev.properties |
| **GPT-4o Vision** | Room verification - analyzing webcam images | Hardcoded in `OpenAiVisionServiceImpl.java` |

---

## Key Configurations

### Interview Settings (application-dev.properties)
| Setting | Value | What it does |
|---|---|---|
| `interview.max-duration-minutes` | 60 | Maximum interview duration |
| `interview.max-warnings` | 5 | Max proctoring warnings before termination |
| `interview.context-window-size` | 4 | Number of recent Q&A pairs kept in full detail (rest is summarized) |
| `interview.early-termination.min-questions` | 4 | Min questions before early termination can be suggested |
| `interview.early-termination.skip-ratio-threshold` | 0.5 | 50% skip rate triggers early termination suggestion |
| `interview.early-termination.min-avg-word-count` | 15 | Below 15 words average is considered too short |
| `interview.early-termination.min-confidence-score` | 30.0 | Below 30/100 confidence is considered very low |
| `interview.early-termination.consecutive-skip-threshold` | 2 | 2 consecutive skips triggers early termination |
| `interview.early-termination.consecutive-short-answer-threshold` | 3 | 3 consecutive short/skipped answers triggers early termination |

### Frontend Settings (app.config.ts)
| Setting | Value | What it does |
|---|---|---|
| `INTERVIEW_TIMER_MINUTES` | 60 | Global interview timer |
| `INTERVIEW_QUESTION_TIMER_MINUTES` | 5 | Timer for each question |
| `AUDIO_CHUNK_SECONDS` | 4 | Audio is sent to backend every 4 seconds |
| `INTERVIEW_MAX_PROCTORING_WARNINGS` | 5 | Max warnings before auto-end |
| `INTERVIEW_INACTIVITY_WARNING_SECONDS` | 120 | Warning after 2 min of inactivity |
| `INTERVIEW_INACTIVITY_TIMEOUT_SECONDS` | 180 | Auto-end after 3 min of inactivity |
| `INTERVIEW_INSTRUCTION_COUNTDOWN_SECONDS` | 60 | 60-second countdown before start button enables |
| `INTERVIEW_MAX_CONSECUTIVE_SKIPS` | 3 | Max consecutive unanswered questions |
| `FACE_DETECTION_INTERVAL_MS` | 2000 | Face detection check every 2 seconds |

---

## Where Things Are Stored

| Data | Storage | Details |
|---|---|---|
| Interview schedules | MySQL (`candidate_interview_schedule` table) | Status, timing, evaluation, warnings |
| Conversation transcripts | MySQL (`voice_conversation_entry` table) | Each Q&A entry with speech metrics |
| Proctoring events | MySQL (`proctoring_event` table) | Type, details, timestamp |
| Video recordings | AWS S3 (bucket: `airightpath-interview`) | Full interview video |
| Interview prompts | MySQL (`job_prompt` table) | Customizable system prompts per job |
| Evaluation categories | MySQL (linked to job prompts) | Custom scoring categories per job |

---

## Interview Resume Feature

If a candidate gets disconnected during an interview:
1. When they return, `GET /api/interview/voice/{scheduleId}/resume` is called
2. If the interview is still `IN_PROGRESS`, it returns:
   - Full conversation history
   - Current question index
   - Warning count
3. The interview continues from where it left off
4. If `startVoiceInterview` is called again for an IN_PROGRESS interview, it resumes instead of starting fresh

---

## Question Skip Flow

If a candidate doesn't answer within the time limit (30 seconds):
1. Frontend auto-sends a "skipped" answer via WebSocket
2. Backend saves `[NO RESPONSE - SKIPPED]` as the candidate's entry
3. AI acknowledges the skip (e.g., "No worries, let's move on") and asks the next question
4. After 3 consecutive skips, the interview is auto-ended

---

## Security

- All REST APIs require JWT authentication via `Authorization: Bearer <token>` header
- WebSocket connections require JWT token as a query parameter (`?token=JWT_TOKEN`)
- The `WebSocketAuthInterceptor` validates the token during the WebSocket handshake
- Each WebSocket message verifies that the schedule belongs to the authenticated user
- Role-based access control (RBAC) is enforced:
  - `INTERVIEW_START` permission required for candidates
  - `INTERVIEW_ANSWER` permission required for answering
  - `INTERVIEW_ASSIGN` permission required for admins
