# Voice Interview System — Architecture & End-to-End Flow

> **Version:** 1.0
> **Last Updated:** 2026-02-28
> **System:** AI RightPath — Real-Time Voice Interview Platform

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture](#3-high-level-architecture)
4. [AI Models & Their Roles](#4-ai-models--their-roles)
5. [Interview Lifecycle — Phase by Phase](#5-interview-lifecycle--phase-by-phase)
6. [REST API Reference](#6-rest-api-reference)
7. [WebSocket Communication](#7-websocket-communication)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Backend Architecture](#9-backend-architecture)
10. [Evaluation Engine](#10-evaluation-engine)
11. [Proctoring System](#11-proctoring-system)
12. [Data Model](#12-data-model)
13. [Configuration Reference](#13-configuration-reference)
14. [Sequence Diagrams](#14-sequence-diagrams)

---

## 1. System Overview

The Voice Interview System is a real-time, AI-powered interview platform where candidates have a natural voice conversation with an AI interviewer named **"Sarah"**. The system:

- Conducts a structured 60-minute interview across 6 phases (18 questions)
- Adapts difficulty dynamically based on candidate performance
- Transcribes speech in real-time using OpenAI Whisper
- Generates contextual follow-up questions using GPT-4o
- Speaks responses aloud using OpenAI TTS (text-to-speech)
- Analyzes speech patterns (pace, filler words, confidence)
- Enforces proctoring (fullscreen, face detection, tab switches, devtools)
- Records video for audit and uploads as a single file post-completion
- Generates a comprehensive evaluation with scores across 5 categories

```
┌─────────────────────────────────────────────────────────────────┐
│                        CANDIDATE BROWSER                        │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Mic Input │  │  Camera  │  │ Speaker  │  │  Proctoring   │  │
│  │ (WebRTC) │  │ (WebRTC) │  │(WebAudio)│  │(Face/Tab/FS)  │  │
│  └─────┬────┘  └────┬─────┘  └────▲─────┘  └───────┬───────┘  │
│        │            │              │                │           │
│  ┌─────▼────────────▼──────────────┴────────────────▼─────────┐│
│  │              React Frontend (SPA)                           ││
│  │  useVoiceInterview │ useAudioStreaming │ useAudioPlayback   ││
│  └────────┬───────────────────┬───────────────────────────────┘│
│           │ REST (HTTPS)      │ WebSocket (STOMP/SockJS)       │
└───────────┼───────────────────┼─────────────────────────────────┘
            │                   │
            ▼                   ▼
┌───────────────────────────────────────────────────────────────────┐
│                     SPRING BOOT BACKEND                           │
│                                                                   │
│  ┌────────────────┐    ┌──────────────────────────────────────┐  │
│  │ REST Controller │    │  WebSocket Controller (STOMP)        │  │
│  │ /api/interview/ │    │  /app/interview/{id}/audio-chunk     │  │
│  │   voice/start   │    │  /app/interview/{id}/submit-answer   │  │
│  │   voice/{id}/end│    │  /app/interview/{id}/interrupt       │  │
│  │   voice/{id}/   │    │  /app/interview/{id}/proctoring-event│  │
│  │   evaluation    │    └──────────┬───────────────────────────┘  │
│  └───────┬────────┘               │                               │
│          │                        │                               │
│  ┌───────▼────────────────────────▼───────────────────────────┐  │
│  │                  Service Layer                              │  │
│  │  VoiceInterviewServiceImpl  │  InterviewContextService     │  │
│  │  InterviewEvaluationService │  ToneAnalysisService         │  │
│  │  TextToSpeechService        │  OpenAiStreamingService      │  │
│  └───────────────────┬────────────────────────────────────────┘  │
│                      │                                            │
│  ┌───────────────────▼────────────────────────────────────────┐  │
│  │  External APIs: OpenAI GPT-4o │ Whisper │ TTS-1-HD         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  MySQL (RDS) │  │  AWS S3      │  │  Async Thread Pools  │   │
│  │  Entities &  │  │  Video       │  │  transcription (4+8) │   │
│  │  Transcripts │  │  Recordings  │  │  tts (2+4)           │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript + Vite | SPA framework |
| **UI** | Tailwind CSS + Lucide Icons | Styling & icons |
| **State** | React hooks (custom) | Interview orchestration |
| **WebSocket Client** | @stomp/stompjs + sockjs-client | Real-time bidirectional messaging |
| **Audio Capture** | Web MediaRecorder API | Microphone recording |
| **Audio Playback** | Web Audio API + AudioContext | TTS playback with amplitude visualization |
| **Face Detection** | face-api.js (TensorFlow.js) | Proctoring — face presence check |
| **Backend** | Spring Boot 3.x (Java 21) | REST + WebSocket server |
| **WebSocket Server** | Spring WebSocket + STOMP | Pub/sub messaging |
| **ORM** | Spring Data JPA + Hibernate | Database access |
| **HTTP Client** | OkHttp 4 | OpenAI API calls |
| **AI Chat** | OpenAI GPT-4o | Question generation, evaluation, summaries |
| **AI Transcription** | OpenAI Whisper (whisper-1) | Real-time speech-to-text |
| **AI Voice** | OpenAI TTS (tts-1-hd, voice: nova) | Text-to-speech for interviewer |
| **Database** | MySQL 8 (AWS RDS) | Persistent storage |
| **Object Storage** | AWS S3 | Interview video recordings |
| **Async** | Spring @Async + ThreadPoolTaskExecutor | Non-blocking transcription & TTS |

---

## 3. High-Level Architecture

### Communication Protocols

```
┌──────────┐         HTTPS (REST)          ┌──────────┐
│          │ ──────────────────────────────→ │          │
│          │  POST /voice/start             │          │
│          │  POST /voice/{id}/end          │          │
│ Frontend │  GET  /voice/{id}/evaluation   │ Backend  │
│          │  POST /{id}/video              │          │
│          │ ←────────────────────────────── │          │
│          │         JSON responses          │          │
│          │                                 │          │
│          │    WebSocket (STOMP/SockJS)     │          │
│          │ ═══════════════════════════════ │          │
│          │  → audio-chunk (base64)         │          │
│          │  → submit-answer (JSON)         │          │
│          │  → interrupt (JSON)             │          │
│          │  → proctoring-event (JSON)      │          │
│          │                                 │          │
│          │  ← transcription (JSON)         │          │
│          │  ← ai-token (streaming JSON)    │          │
│          │  ← tts-audio (base64 mp3)       │          │
│          │  ← tts-fallback (text)          │          │
│          │  ← filler (text)                │          │
│          │  ← phase-change (JSON)          │          │
│          │  ← response-complete (JSON)     │          │
└──────────┘                                 └──────────┘
```

### Why Two Protocols?

| Protocol | Used For | Reason |
|----------|---------|--------|
| **REST (HTTPS)** | Start, end, evaluation, video upload | Request-response; needs auth headers; large payloads |
| **WebSocket (STOMP)** | Audio streaming, transcription, AI tokens, TTS | Low-latency bidirectional; real-time streaming; pub/sub topics |

---

## 4. AI Models & Their Roles

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OpenAI API (api.openai.com/v1)                 │
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │      GPT-4o          │  │   Whisper-1      │  │   TTS-1-HD    │ │
│  │  (Chat Completions)  │  │ (Transcriptions) │  │ (Audio/Speech)│ │
│  ├─────────────────────┤  ├──────────────────┤  ├───────────────┤ │
│  │ 1. First question    │  │ Real-time speech  │  │ Interviewer   │ │
│  │    generation        │  │ → text with word  │  │ voice output  │ │
│  │                      │  │   timestamps      │  │               │ │
│  │ 2. Follow-up question│  │                   │  │ Voice: nova   │ │
│  │    generation        │  │ Input: webm audio │  │ Format: mp3   │ │
│  │    (streamed tokens) │  │ Output: text +    │  │               │ │
│  │                      │  │   word[]          │  │ Sentence-by-  │ │
│  │ 3. Running summary   │  │                   │  │ sentence      │ │
│  │    compression       │  │ 4-second chunks   │  │ streaming     │ │
│  │                      │  │ processed async   │  │               │ │
│  │ 4. Final evaluation  │  │                   │  │ Fallback:     │ │
│  │    (5 categories)    │  │                   │  │ Browser       │ │
│  │                      │  │                   │  │ SpeechSynth   │ │
│  ├─────────────────────┤  ├──────────────────┤  ├───────────────┤ │
│  │ temp: 0.7            │  │ response_format:  │  │ model:        │ │
│  │ streaming: 500 tok   │  │   verbose_json    │  │   tts-1-hd    │ │
│  │ non-stream: 2000 tok │  │ granularity: word │  │ voice: nova   │ │
│  └─────────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

| Model | API Endpoint | Purpose | When Called |
|-------|-------------|---------|-------------|
| **GPT-4o** | `/v1/chat/completions` | Generate interview questions | On each Q&A turn (streamed) |
| **GPT-4o** | `/v1/chat/completions` | Generate first question | Interview start (non-streamed) |
| **GPT-4o** | `/v1/chat/completions` | Compress conversation context | When context window exceeded |
| **GPT-4o** | `/v1/chat/completions` | Generate 5-category evaluation | After interview ends (async) |
| **Whisper-1** | `/v1/audio/transcriptions` | Real-time speech-to-text | Every 4 seconds during recording |
| **TTS-1-HD** | `/v1/audio/speech` | Interviewer voice (nova) | After each AI response (sentence-by-sentence) |

---

## 5. Interview Lifecycle — Phase by Phase

### Interview Phases

```
 ┌──────────────┐   ┌────────────┐   ┌───────────┐   ┌─────────────────┐   ┌────────────┐   ┌─────────┐
 │ INTRODUCTION │──→│ BACKGROUND │──→│ TECHNICAL │──→│ PROBLEM_SOLVING │──→│ BEHAVIORAL │──→│ CLOSING │
 │   3 min      │   │   8 min    │   │  20 min   │   │    12 min       │   │  10 min    │   │  5 min  │
 │   2 Q's      │   │   3 Q's    │   │   6 Q's   │   │     3 Q's       │   │   3 Q's    │   │  1 Q    │
 └──────────────┘   └────────────┘   └───────────┘   └─────────────────┘   └────────────┘   └─────────┘
                                                                                          Total: ~58 min, 18 Q's
```

| Phase | Duration | Questions | Difficulty Range | Focus |
|-------|----------|-----------|-----------------|-------|
| **Introduction** | 3 min | 2 | 1-2 | Warm greeting, build rapport, ask about themselves |
| **Background** | 8 min | 3 | 2-3 | Work experience, projects, career trajectory |
| **Technical** | 20 min | 6 | 2-5 | Role-specific technical depth, progressive difficulty |
| **Problem Solving** | 12 min | 3 | 3-5 | Real-world scenarios, system design, structured thinking |
| **Behavioral** | 10 min | 3 | 2-4 | STAR format, teamwork, leadership, conflict resolution |
| **Closing** | 5 min | 1 | 1-2 | Thank candidate, invite questions, positive close |

### Dynamic Difficulty Adjustment (Levels 1-5)

```
Candidate gives strong answer          Candidate gives weak answer
(wordCount > 100 AND                   (wordCount < 30 AND
 confidenceScore > 70)                  confidenceScore < 40)
        │                                       │
        ▼                                       ▼
  Difficulty ↑ (+1)                       Difficulty ↓ (-1)
  Harder questions                       Easier questions
  (max level 5)                          (min level 1)
```

### Phase Transition Logic

```
questionsAskedInPhase >= targetQuestions?
        │
        YES → transitionToNextPhase()
        │     Reset questionsAskedInPhase = 0
        │     Send phase-change WS message
        │     Include transition prompt to GPT
        │
        NO  → Continue in current phase
```

---

## 6. REST API Reference

### Voice Interview Endpoints

| Method | Endpoint | Auth | Purpose | Request | Response |
|--------|----------|------|---------|---------|----------|
| `POST` | `/api/interview/voice/start` | Bearer JWT | Start interview | `{email, jobPrefix}` | `VoiceStartResponse` |
| `POST` | `/api/interview/voice/{id}/end` | Bearer JWT | End interview | — | `200 OK` |
| `GET` | `/api/interview/voice/{id}/status` | Bearer JWT | Get session status | — | `VoiceSessionStatus` |
| `GET` | `/api/interview/voice/{id}/evaluation` | Bearer JWT | Get evaluation | — | `VoiceEvaluationResult` |
| `POST` | `/api/interview/{id}/video` | Bearer JWT | Upload video recording | `multipart/form-data` (file) | `200 OK` |

### Response DTOs

**VoiceStartResponse**
```json
{
  "scheduleId": 3,
  "firstQuestion": "Hi there! I'm Sarah, and I'll be your interviewer today...",
  "interviewerName": "Sarah",
  "firstQuestionAudio": "<base64-encoded-mp3>"
}
```

**VoiceSessionStatus**
```json
{
  "scheduleId": 3,
  "status": "IN_PROGRESS",
  "currentPhase": "TECHNICAL",
  "difficultyLevel": 3,
  "totalQuestionsAsked": 8,
  "warningCount": 1,
  "startedAt": "2026-02-28T10:30:00",
  "interviewerName": "Sarah"
}
```

**VoiceEvaluationResult** — see [Section 10: Evaluation Engine](#10-evaluation-engine)

---

## 7. WebSocket Communication

### Connection Setup

```
Frontend                                              Backend
   │                                                     │
   │  SockJS connect: /ws?token=<JWT>                    │
   │ ──────────────────────────────────────────────────→ │
   │                                                     │
   │         WebSocketAuthInterceptor                    │
   │         ├─ Extract token from ?token= param         │
   │         ├─ Validate JWT via AccessTokenService      │
   │         ├─ Store userEmail in session attributes    │
   │         └─ Allow/reject handshake                   │
   │                                                     │
   │  STOMP CONNECTED                                    │
   │ ←────────────────────────────────────────────────── │
   │                                                     │
   │  SUBSCRIBE /topic/interview/{id}/transcription      │
   │  SUBSCRIBE /topic/interview/{id}/ai-token           │
   │  SUBSCRIBE /topic/interview/{id}/tts-audio          │
   │  SUBSCRIBE /topic/interview/{id}/tts-fallback       │
   │  SUBSCRIBE /topic/interview/{id}/filler             │
   │  SUBSCRIBE /topic/interview/{id}/phase-change       │
   │  SUBSCRIBE /topic/interview/{id}/response-complete  │
   │  SUBSCRIBE /topic/interview/{id}/transcription-error│
   │ ──────────────────────────────────────────────────→ │
```

### Messages: Client → Server

| Destination | Payload | When Sent |
|------------|---------|-----------|
| `/app/interview/{id}/audio-chunk` | `{"audio": "<base64>"}` | Every 4 seconds while recording |
| `/app/interview/{id}/submit-answer` | `{"transcript": "...", "wordTimestamps": [...]}` | When candidate clicks "Stop" |
| `/app/interview/{id}/interrupt` | `{"reason": "candidate_speaking"}` | When candidate starts mic while AI speaks |
| `/app/interview/{id}/proctoring-event` | `{"type": "tab_switch", "details": "..."}` | On proctoring violation |

### Messages: Server → Client (Pub/Sub Topics)

| Topic | Payload | When Sent |
|-------|---------|-----------|
| `transcription` | `{"text", "words[]", "duration", "chunkIndex"}` | After each audio chunk transcribed |
| `ai-token` | `{"token": "word", "done": false}` | Each GPT token as it streams |
| `ai-token` | `{"token": "", "done": true, "fullText": "..."}` | When GPT response complete |
| `tts-audio` | `{"audio": "<base64-mp3>", "text", "chunkIndex", "isLast"}` | Each sentence TTS generated |
| `tts-fallback` | `{"text": "..."}` | When TTS fails — client uses browser speech |
| `filler` | `{"text": "That's a great point...", "type": "filler"}` | While server processes answer |
| `phase-change` | `{"previousPhase", "newPhase", "durationMinutes"}` | On phase transition |
| `response-complete` | `{"phase", "difficultyLevel", "questionsAsked", "isComplete"}` | After full AI response |

### Binary Audio Over SockJS

SockJS only supports text frames. Audio data is **base64-encoded** before sending:

```
Frontend                          Backend
   │                                 │
   │  MediaRecorder chunk (webm)     │
   │  → ArrayBuffer                  │
   │  → Base64 encode (text)         │
   │  → JSON: {"audio": "<base64>"} │
   │  → STOMP SEND (text frame)      │
   │ ─────────────────────────────→  │
   │                                 │  Base64 decode → byte[]
   │                                 │  → Whisper API
```

---

## 8. Frontend Architecture

### React Hook Hierarchy

```
InterviewPage.tsx (main component)
│
├── useVoiceInterview()          ← Main orchestrator (state machine)
│   ├── useAudioStreaming()      ← Microphone recording + WS audio chunks
│   └── useAudioPlayback()       ← TTS queue + Web Audio playback
│
├── useMediaRecorder()           ← Video recording (single file, post-upload)
├── useFullscreen()              ← Fullscreen enforcement
├── useFaceDetection()           ← Face-api.js proctoring
├── usePageVisibility()          ← Tab switch detection
├── useDevToolsDetection()       ← DevTools detection
└── useTimer()                   ← 60-minute countdown
```

### State Machine — `useVoiceInterview`

```
                    ┌─────────────┐
                    │  pre-start  │  Initial state
                    └──────┬──────┘
                           │ startInterview()
                    ┌──────▼──────┐
                    │  starting   │  API call in progress
                    └──────┬──────┘
                           │ API success + WS connected
                    ┌──────▼──────┐
              ┌────→│   active    │←────────────────────┐
              │     └──────┬──────┘                      │
              │            │ startAnswering()             │
              │     ┌──────▼──────┐                      │
              │     │  answering  │  Mic recording        │
              │     └──────┬──────┘                      │
              │            │ submitAnswer()               │
              │     ┌──────▼──────┐                      │
              │     │ processing  │  Waiting for AI       │
              │     └──────┬──────┘                      │
              │            │ response-complete            │
              │            │ (isComplete: false)          │
              └────────────┘                              │
                                                          │
              response-complete (isComplete: true)        │
              OR endInterview()                           │
              OR max proctoring warnings                  │
                           │                              │
                    ┌──────▼──────┐                      │
                    │  completed  │  Post-completion flow │
                    └──────┬──────┘                      │
                           │                              │
                    ┌──────▼──────────────────────────┐  │
                    │  Post-Completion Overlay         │  │
                    │  1. Ending interview      ✓     │  │
                    │  2. Uploading video       ⟳     │  │
                    │  3. Generating evaluation  ○     │  │
                    │  4. Done → Navigate to summary  │  │
                    └─────────────────────────────────┘  │
                                                          │
                    ┌─────────────┐                      │
                    │    error    │  API/WS failure       │
                    └─────────────┘                      │
```

### Audio Data Flow

```
┌─────────────────── AUDIO CAPTURE ───────────────────────────────┐
│                                                                  │
│  Microphone → MediaRecorder (4s chunks) → ArrayBuffer            │
│                     │                                            │
│                     ▼                                            │
│  Base64 encode → WS sendBinary → /app/.../audio-chunk           │
│                                       │                          │
│                                       ▼                          │
│                              Backend: Whisper API                │
│                                       │                          │
│                                       ▼                          │
│                    /topic/.../transcription → Display live text   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────── AUDIO PLAYBACK ──────────────────────────────┐
│                                                                  │
│  Backend: GPT response → split by sentences → TTS per sentence   │
│                                       │                          │
│                                       ▼                          │
│               /topic/.../tts-audio (base64 mp3 chunks)           │
│                          │                                       │
│                          ▼                                       │
│   useAudioPlayback queue → AudioContext → AnalyserNode → Speaker │
│                                              │                   │
│                                              ▼                   │
│                                    amplitude (0-1) → AI Avatar   │
│                                    mouth animation               │
│                                                                  │
│   Fallback: /topic/.../tts-fallback → Browser SpeechSynthesis    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Video Recording Flow

```
Interview Start                              Interview End
     │                                            │
     ▼                                            ▼
 MediaRecorder.start(15s timeslice)         stopAndGetBlob()
     │                                            │
     ├─ Chunk 1 → local state                     ├─ Assemble all chunks
     ├─ Chunk 2 → local state                     │  into single Blob
     ├─ Chunk 3 → local state                     │
     ├─ ...                                        ▼
     │                                       POST /api/interview/{id}/video
     │  (NO upload during recording)               │
     │  (chunks accumulate locally)                ▼
     │                                        AWS S3 storage
     └─ No bandwidth wasted                   (single .webm file)
```

---

## 9. Backend Architecture

### Service Dependency Graph

```
InterviewController (REST)
VoiceInterviewWebSocketController (WebSocket)
        │
        ▼
VoiceInterviewServiceImpl
        │
        ├──→ InterviewContextService
        │        │
        │        ├─ buildSystemPrompt()         → GPT system message
        │        ├─ buildContextMessages()      → Rolling context window
        │        ├─ buildFirstQuestionPrompt()   → First question prompt
        │        ├─ buildNextQuestionPrompt()    → Follow-up prompt
        │        └─ updateRunningSummary()       → Context compression via GPT
        │
        ├──→ ToneAnalysisService
        │        │
        │        └─ analyze()                   → ToneMetrics
        │           (wordCount, WPM, fillerWords, confidenceScore)
        │
        ├──→ OpenAiStreamingService
        │        │
        │        ├─ chatCompletion()            → GPT-4o (non-streaming)
        │        ├─ streamChatCompletion()      → GPT-4o (token-by-token SSE)
        │        ├─ transcribe()                → Whisper-1 (word timestamps)
        │        └─ textToSpeech()              → TTS-1-HD (mp3 bytes)
        │
        ├──→ TextToSpeechService
        │        │
        │        ├─ generateTTSBase64()          → Single mp3 (first question)
        │        └─ generateAndStreamTTS()       → Sentence-by-sentence WS push
        │                                          (@Async on ttsExecutor)
        │
        └──→ InterviewEvaluationService
                 │
                 ├─ triggerEvaluationAsync()     → Fire-and-forget (@Async)
                 └─ evaluateInterview()          → GPT-4o evaluation + cache
```

### Async Thread Pools

```
┌─────────────────────────────────────────────┐
│           AsyncConfig.java                   │
│                                              │
│  transcriptionExecutor                       │
│  ├─ Core: 4 threads                         │
│  ├─ Max:  8 threads                         │
│  ├─ Queue: 50                               │
│  └─ Used for: Whisper transcription chunks,  │
│               Async evaluation generation    │
│                                              │
│  ttsExecutor                                 │
│  ├─ Core: 2 threads                         │
│  ├─ Max:  4 threads                         │
│  ├─ Queue: 20                               │
│  └─ Used for: TTS sentence-by-sentence      │
│               generation and WS push         │
└─────────────────────────────────────────────┘
```

### Context Window Management

The system uses a **rolling context window** to keep GPT calls within token limits:

```
Conversation grows:  Entry 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...

Context window size = 4 exchanges = 8 entries (interviewer + candidate)

When entries > window size:
  ┌───────────────────────────────────────┐
  │  Older entries (1-6)                  │
  │  → Summarized by GPT into            │
  │    runningSummary (200 words max)     │
  │  → Stored in schedule.runningSummary  │
  └───────────────────────────────────────┘

  GPT receives:
  1. System prompt (persona, phase, difficulty)
  2. Running summary (compressed history)
  3. Last 8 entries (recent context)
  4. Current user message (prompt for next question)
```

---

## 10. Evaluation Engine

### Evaluation Trigger Flow

```
Interview ends (any trigger)
        │
        ▼
endVoiceInterview() OR processVoiceAnswer() natural completion
        │
        ├─ Mark schedule as COMPLETED
        │
        └─ evaluationService.triggerEvaluationAsync(scheduleId)
                │
                ▼  (runs on transcriptionExecutor thread pool)
           evaluateInterview(scheduleId)
                │
                ├─ Check cache: schedule.evaluationJson != null?
                │       YES → parse and return cached result
                │       NO  → continue generation
                │
                ├─ Build transcript from all VoiceConversationEntries
                │
                ├─ Call GPT-4o with EVALUATION_PROMPT
                │
                ├─ Parse JSON response
                │
                ├─ Calculate speech analysis from candidate entries
                │
                └─ Save evaluationJson to database (cache)
```

### Evaluation Categories (5)

```json
{
  "overallScore": 78,
  "recommendation": "HIRE",
  "summary": "Strong technical candidate with good communication...",
  "strengths": [
    "Deep understanding of distributed systems",
    "Clear and structured communication",
    "Strong problem-solving approach"
  ],
  "areasForImprovement": [
    "Could elaborate more on behavioral examples",
    "Moderate use of filler words",
    "Could improve response conciseness"
  ],
  "categoryScores": [
    { "category": "Technical Skills",              "score": 82, "weight": 0.30, "feedback": "..." },
    { "category": "Communication",                 "score": 75, "weight": 0.20, "feedback": "..." },
    { "category": "Problem Solving",               "score": 80, "weight": 0.20, "feedback": "..." },
    { "category": "Behavioral & Culture Fit",      "score": 70, "weight": 0.15, "feedback": "..." },
    { "category": "Articulation & Confidence",     "score": 73, "weight": 0.15, "feedback": "..." }
  ],
  "speechAnalysis": {
    "averageWordsPerMinute": 142.5,
    "totalFillerWords": 12,
    "confidenceScore": 71.3,
    "paceAssessment": "Excellent pace - natural and easy to follow",
    "articulationFeedback": "Generally articulate with moderate use of filler words"
  }
}
```

### Speech Analysis Metrics (calculated from all candidate entries)

| Metric | Source | Calculation |
|--------|--------|-------------|
| **Words Per Minute** | Word timestamps from Whisper | `wordCount / (durationSeconds / 60)` |
| **Filler Words** | Pattern matching (20 fillers: um, uh, like, you know...) | Count of occurrences |
| **Confidence Score** | Composite of 4 factors | `0.3*pace + 0.3*filler + 0.2*pause + 0.2*length` |
| **Pace Assessment** | WPM range | 120-160: Excellent, <120: Slow, >160: Fast |
| **Articulation** | Filler count | <=5: Very articulate, <=15: Moderate, >15: Frequent |

---

## 11. Proctoring System

### Proctoring Components

```
┌─────────────────────────────────────────────────────────────┐
│                    PROCTORING LAYER                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Fullscreen   │  │ Tab Switch   │  │ Face Detection   │  │
│  │  Enforcement  │  │  Detection   │  │  (face-api.js)   │  │
│  │              │  │              │  │                  │  │
│  │ useFullscreen │  │usePageVisib. │  │ useFaceDetection │  │
│  │              │  │              │  │                  │  │
│  │ On exit:     │  │ On hidden:   │  │ On no face:      │  │
│  │ warning +    │  │ warning +    │  │ warning +        │  │
│  │ overlay      │  │ WS event     │  │ WS event         │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐ │
│  │                 Warning Aggregator                      │ │
│  │  totalWarnings = tab + face + fullscreen + devtools     │ │
│  │                                                         │ │
│  │  if (totalWarnings >= 5) → AUTO-END INTERVIEW           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────┐                                           │
│  │  DevTools     │                                           │
│  │  Detection    │                                           │
│  │              │                                           │
│  │useDevToolsDet│                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### Warning Flow

```
Proctoring violation detected (frontend)
        │
        ├─ Increment local warning counter
        ├─ Show toast notification
        │
        └─ WS SEND: /app/.../proctoring-event
                │     {"type": "tab_switch", "details": "Tab hidden"}
                │
                ▼
           Backend: handleProctoringEvent()
                │
                ├─ schedule.addWarning()
                │
                └─ warningCount >= 5?
                        │
                        YES → Mark COMPLETED + FAILED
                        │    Send response-complete {terminated: true}
                        │
                        NO  → Continue interview
```

### Three Interview End Triggers

| Trigger | Confirmation? | Flow |
|---------|:---:|------|
| **Candidate clicks "End"** | Yes — ConfirmDialog | Confirm → post-completion overlay → upload → evaluate → summary |
| **Natural completion** (18 questions) | No | Backend sends `isComplete: true` → auto post-completion flow |
| **Max proctoring warnings** (5) | No | Auto post-completion flow (interview result: FAILED) |

---

## 12. Data Model

### Entity Relationship

```
┌─────────────────────────────────────┐
│   CandidateInterviewSchedule        │
├─────────────────────────────────────┤
│ id (PK)                Long         │
│ jobPrefix              String       │
│ email                  String       │
│ attemptStatus          Enum         │←── NOT_ATTEMPTED | IN_PROGRESS | COMPLETED
│ interviewResult        Enum         │←── PENDING | PASSED | FAILED
│ interviewerName        String       │    (default: "Sarah")
│ currentPhase           Enum         │←── INTRODUCTION → ... → CLOSING
│ difficultyLevel        int          │    (1-5, default: 2)
│ questionsAskedInPhase  int          │
│ totalQuestionsAsked    int          │
│ warningCount           int          │
│ runningSummary         TEXT          │    (GPT-compressed context)
│ evaluationJson         LONGTEXT     │    (cached evaluation JSON)
│ recordReferences       TEXT          │    (S3 video URL)
│ assignedAt             LocalDateTime│
│ startedAt              LocalDateTime│
│ endedAt                LocalDateTime│
│ deadlineTime           LocalDateTime│
└──────────────┬──────────────────────┘
               │ 1
               │
               │ *
┌──────────────▼──────────────────────┐
│     VoiceConversationEntry          │
├─────────────────────────────────────┤
│ id (PK)                Long         │
│ interviewScheduleId    Long (FK)    │
│ role                   Enum         │←── SYSTEM | INTERVIEWER | CANDIDATE
│ content                TEXT          │    (the spoken message)
│ phase                  Enum         │    (phase when entry created)
│ difficultyLevel        int          │
│ timestamp              LocalDateTime│
│                                     │
│ ── Candidate-only metrics ──        │
│ wordCount              Integer      │
│ wordsPerMinute         Double       │
│ fillerWordCount        Integer      │
│ confidenceScore        Double       │    (0-100)
│ speechDurationSeconds  Double       │
└─────────────────────────────────────┘
```

---

## 13. Configuration Reference

### Backend (application-dev.properties)

| Property | Value | Purpose |
|----------|-------|---------|
| `openai.model` | `gpt-4o` | Chat model for questions & evaluation |
| `openai.audio.model` | `whisper-1` | Speech-to-text model |
| `openai.tts.model` | `tts-1-hd` | Text-to-speech model |
| `openai.tts.voice` | `nova` | TTS voice persona |
| `interview.max-warnings` | `5` | Proctoring termination threshold |
| `interview.max-duration-minutes` | `60` | Max interview time |
| `interview.context-window-size` | `4` | Rolling context (4 exchanges = 8 entries) |
| `spring.servlet.multipart.max-file-size` | `500MB` | Video upload limit |

### Frontend (app.config.ts)

| Property | Value | Purpose |
|----------|-------|---------|
| `INTERVIEW_TIMER_MINUTES` | `60` | Global countdown timer |
| `AUDIO_CHUNK_SECONDS` | `4` | Mic audio chunk interval |
| `AUDIO_CHUNK_MIME_TYPE` | `audio/webm;codecs=opus` | Audio recording format |
| `VIDEO_CHUNK_SECONDS` | `15` | Video chunk interval (local accumulation) |
| `INTERVIEW_MAX_PROCTORING_WARNINGS` | `5` | Frontend warning threshold |
| `FACE_DETECTION_MAX_WARNINGS` | `3` | Face-specific warning limit |
| `WS_RECONNECT_MAX_ATTEMPTS` | `10` | WebSocket reconnect tries |
| `WS_RECONNECT_BASE_DELAY_MS` | `1000` | Reconnect base delay |

---

## 14. Sequence Diagrams

### A. Full Interview Start Sequence

```
Candidate          Frontend                    Backend                   OpenAI
   │                  │                           │                        │
   │ Click "Start"    │                           │                        │
   │─────────────────→│                           │                        │
   │                  │                           │                        │
   │                  │ enterFullscreen()          │                        │
   │                  │ loadFaceDetectionModels()  │                        │
   │                  │                           │                        │
   │                  │  POST /voice/start         │                        │
   │                  │──────────────────────────→│                        │
   │                  │                           │                        │
   │                  │                           │ findSchedule(prefix,    │
   │                  │                           │              email)     │
   │                  │                           │ setStatus(IN_PROGRESS)  │
   │                  │                           │                        │
   │                  │                           │ buildFirstQuestionPrompt│
   │                  │                           │ buildContextMessages    │
   │                  │                           │                        │
   │                  │                           │  chatCompletion ───────→│
   │                  │                           │                        │ GPT-4o
   │                  │                           │  ←── first question ───│
   │                  │                           │                        │
   │                  │                           │  textToSpeech ────────→│
   │                  │                           │                        │ TTS-1-HD
   │                  │                           │  ←── mp3 bytes ───────│
   │                  │                           │                        │
   │                  │                           │ save ConversationEntry  │
   │                  │                           │ incrementQuestionsAsked │
   │                  │                           │                        │
   │                  │  ←── VoiceStartResponse ──│                        │
   │                  │  {question, audio, id}     │                        │
   │                  │                           │                        │
   │                  │ Connect WebSocket          │                        │
   │                  │ (/ws?token=JWT)            │                        │
   │                  │══════════════════════════→│                        │
   │                  │                           │ Validate JWT            │
   │                  │  ←══ STOMP CONNECTED ═════│                        │
   │                  │                           │                        │
   │                  │ Subscribe to 8 topics      │                        │
   │                  │                           │                        │
   │                  │ startVideoRecording()      │                        │
   │                  │ startFaceDetection()       │                        │
   │                  │ startGlobalTimer(60min)    │                        │
   │                  │                           │                        │
   │  ←── Play first question audio (TTS)         │                        │
   │  ←── Show AI Avatar speaking animation       │                        │
   │                  │                           │                        │
```

### B. Single Q&A Turn

```
Candidate          Frontend                    Backend                   OpenAI
   │                  │                           │                        │
   │ Click mic 🎤     │                           │                        │
   │─────────────────→│                           │                        │
   │                  │ startAnswering()           │                        │
   │                  │ getUserMedia({audio})      │                        │
   │                  │ MediaRecorder.start(4000)  │                        │
   │                  │                           │                        │
   │ Speaking...      │                           │                        │
   │                  │                           │                        │
   │                  │ ─── 4s chunk ────────────→│                        │
   │                  │ {"audio":"<base64>"}       │ decode base64          │
   │                  │                           │ transcribeAsync ──────→│
   │                  │                           │                        │ Whisper
   │                  │  ←── transcription ════════│  ←── text + words ────│
   │                  │ {text, words[]}            │                        │
   │  ←── Show live   │                           │                        │
   │      transcript  │                           │                        │
   │                  │                           │                        │
   │                  │ ─── 4s chunk ────────────→│ (repeat transcription) │
   │                  │  ←── transcription ════════│                        │
   │                  │                           │                        │
   │ Click stop ⬛    │                           │                        │
   │─────────────────→│                           │                        │
   │                  │ submitAnswer()             │                        │
   │                  │ stopRecording()            │                        │
   │                  │                           │                        │
   │                  │ ═══ submit-answer ════════→│                        │
   │                  │ {transcript,timestamps}    │                        │
   │                  │                           │ toneAnalysis.analyze()  │
   │                  │                           │ save CandidateEntry     │
   │                  │                           │ adjustDifficulty()      │
   │                  │                           │ checkPhaseTransition()  │
   │                  │                           │                        │
   │                  │  ←══ filler ═══════════════│ (thinking message)     │
   │  ←── "That's a   │                           │                        │
   │      great point" │                           │ updateRunningSummary() │
   │                  │                           │ buildNextQuestionPrompt│
   │                  │                           │ buildContextMessages   │
   │                  │                           │                        │
   │                  │                           │ streamChatCompletion ─→│
   │                  │                           │                        │ GPT-4o
   │                  │  ←══ ai-token ═════════════│  ←── token ──────────│
   │                  │  {token:"Can", done:false}│  ←── token ──────────│
   │  ←── Streaming   │  ←══ ai-token ═════════════│  ←── token ──────────│
   │      text display │  {token:"you",done:false} │  ...                   │
   │                  │  ←══ ai-token ═════════════│  ←── [DONE] ─────────│
   │                  │  {done:true,fullText:"..."}│                        │
   │                  │                           │                        │
   │                  │                           │ save InterviewerEntry   │
   │                  │                           │                        │
   │                  │                           │ generateAndStreamTTS ─→│
   │                  │                           │ (async, per sentence)  │ TTS-1-HD
   │                  │  ←══ tts-audio ════════════│  ←── mp3 bytes ──────│
   │  ←── Play audio  │  {audio, isLast:false}    │                        │
   │      sentence 1  │  ←══ tts-audio ════════════│  ←── mp3 bytes ──────│
   │  ←── Play audio  │  {audio, isLast:true}     │                        │
   │      sentence 2  │                           │                        │
   │                  │                           │                        │
   │                  │  ←══ response-complete ════│                        │
   │                  │  {phase, difficulty,       │                        │
   │                  │   questionsAsked,          │                        │
   │                  │   isComplete: false}       │                        │
   │                  │                           │                        │
   │  ←── State: active (ready for next answer)    │                        │
   │                  │                           │                        │
```

### C. Interview End & Post-Completion

```
Candidate          Frontend                    Backend                   OpenAI
   │                  │                           │                        │
   │ Click "End" 🔴   │                           │                        │
   │─────────────────→│                           │                        │
   │                  │ Show ConfirmDialog         │                        │
   │                  │ "End Interview Early?"     │                        │
   │                  │                           │                        │
   │ Click "Confirm"  │                           │                        │
   │─────────────────→│                           │                        │
   │                  │                           │                        │
   │  ←── Post-Completion Overlay                 │                        │
   │      [⟳] Ending interview                    │                        │
   │      [○] Uploading video                     │                        │
   │      [○] Generating evaluation               │                        │
   │                  │                           │                        │
   │                  │  POST /voice/{id}/end      │                        │
   │                  │──────────────────────────→│                        │
   │                  │                           │ setStatus(COMPLETED)    │
   │                  │                           │ setEndedAt(now)         │
   │                  │                           │                        │
   │                  │                           │ triggerEvalAsync() ────→│
   │                  │  ←── 200 OK ──────────────│           (background) │ GPT-4o
   │                  │                           │                        │ Evaluation
   │  ←── Overlay:    │                           │                        │
   │      [✓] Ending  │                           │                        │
   │      [⟳] Uploading video                     │                        │
   │      [○] Generating evaluation               │                        │
   │                  │                           │                        │
   │                  │ stopAndGetBlob()           │                        │
   │                  │ (assemble video chunks)    │                        │
   │                  │                           │                        │
   │                  │  POST /{id}/video          │                        │
   │                  │  (multipart .webm file)    │                        │
   │                  │──────────────────────────→│                        │
   │                  │                           │ Upload to S3            │
   │                  │                           │ Store URL in schedule   │
   │                  │  ←── 200 OK ──────────────│                        │
   │                  │                           │                        │
   │  ←── Overlay:    │                           │                        │
   │      [✓] Ending  │                           │                        │
   │      [✓] Uploaded │                           │                        │
   │      [⟳] Generating evaluation               │                        │
   │                  │                           │                        │
   │                  │  GET /voice/{id}/evaluation│                        │
   │                  │──────────────────────────→│                        │
   │                  │                           │ evaluationJson cached?  │
   │                  │                           │  YES → return cached    │
   │                  │                           │  NO  → generate now ───→│
   │                  │                           │                        │ GPT-4o
   │                  │  ←── VoiceEvaluationResult │  ←── eval JSON ───────│
   │                  │                           │                        │
   │  ←── Overlay:    │                           │                        │
   │      [✓] Ending  │                           │                        │
   │      [✓] Uploaded │                           │                        │
   │      [✓] Evaluated│                           │                        │
   │      "All done! Redirecting..."               │                        │
   │                  │                           │                        │
   │  ←── Navigate to InterviewSummaryPage         │                        │
   │      (scores, recommendations, speech analysis)│                       │
   │                  │                           │                        │
```

---

> **Document End**
> For questions, contact the engineering team.
