# RightPath AI Interview - Technical Architecture & Flow Documentation

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI Framework** | Tailwind CSS with CSS variable theming |
| **State Management** | React hooks + Context API |
| **WebSocket Client** | @stomp/stompjs + sockjs-client |
| **Backend** | Spring Boot (Java) |
| **Database** | MySQL |
| **WebSocket Server** | Spring WebSocket (STOMP over SockJS) |
| **AI Provider** | OpenAI API (GPT-4o, Whisper-1, TTS-1-HD) |
| **File Storage** | AWS S3 |
| **Authentication** | JWT (Access + Refresh tokens) |

---

## Project Structure

### Backend (`rightpath-be`)
```
src/main/java/com/rightpath/
├── config/
│   ├── WebSocketConfig.java            # STOMP + raw WS config
│   ├── ApiSecurityConfig.java          # Spring Security config
│   ├── CorsConfig.java                 # CORS settings
│   ├── OpenAIConfig.java               # OpenAI WebClient bean
│   ├── InterviewPromptProperties.java  # Interview prompt config binding
│   └── AuthProperties.java            # JWT/auth config binding
├── controller/
│   ├── InterviewController.java        # REST endpoints for interview
│   └── VoiceInterviewWebSocketController.java  # WS message handlers
├── service/
│   ├── VoiceInterviewService.java      # Interface
│   ├── InterviewService.java           # Interface (scheduling/management)
│   ├── OpenAiStreamingService.java     # OpenAI API calls (GPT, Whisper, TTS)
│   ├── AudioTranscriptionService.java  # Async audio → text via Whisper
│   ├── TextToSpeechService.java        # Async text → audio via TTS
│   ├── InterviewContextService.java    # Prompt building + context management
│   ├── InterviewEvaluationService.java # Evaluation generation
│   ├── ToneAnalysisService.java        # Speech metrics analysis
│   ├── CandidatePerformanceAnalyzer.java # Early termination logic
│   ├── RoomVerificationService.java    # Room scan via Vision API
│   ├── OpenAiVisionService.java        # GPT-4o Vision calls
│   ├── JobPromptService.java           # Prompt templates from DB
│   └── impl/
│       ├── VoiceInterviewServiceImpl.java  # Core interview orchestration
│       ├── InterviewServiceImpl.java       # Scheduling + legacy text interview
│       └── ...
├── entity/
│   ├── CandidateInterviewSchedule.java # Main interview record
│   ├── VoiceConversationEntry.java     # Individual Q&A entries
│   ├── ProctoringEvent.java            # Proctoring violation records
│   ├── RoomVerificationSession.java    # Room verification records
│   └── JobPrompt.java                  # Customizable prompts per job
├── repository/
│   ├── CandidateInterviewScheduleRepository.java
│   ├── VoiceConversationEntryRepository.java
│   ├── ProctoringEventRepository.java
│   └── JobPromptRepository.java
├── enums/
│   ├── AttemptStatus.java        # NOT_ATTEMPTED, IN_PROGRESS, COMPLETED
│   ├── InterviewResult.java      # PENDING, PASSED, FAILED
│   ├── CompletionReason.java     # NATURAL_COMPLETION, TIMEOUT, etc.
│   ├── ConversationRole.java     # SYSTEM, INTERVIEWER, CANDIDATE
│   └── InterviewPhase.java       # INTRODUCTION (kept for DB compat)
├── websocket/
│   ├── WebSocketAuthInterceptor.java   # JWT auth for WS handshake
│   └── VoiceInterviewSocketHandler.java
└── dto/voice/
    ├── VoiceStartResponse.java
    ├── VoiceAnswerRequest.java
    ├── VoiceSessionStatus.java
    ├── VoiceEvaluationResult.java
    ├── ResumeResponse.java
    └── PerformanceSnapshot.java
```

### Frontend (`rightpath-ui`)
```
src/
├── pages/
│   ├── candidate/
│   │   ├── InterviewPage.tsx           # Main interview UI (1183 lines)
│   │   ├── InterviewListPage.tsx       # List of scheduled interviews
│   │   └── InterviewSummaryPage.tsx    # Post-interview summary
│   └── admin/
│       ├── InterviewResultsPage.tsx    # Admin results dashboard
│       └── InterviewSchedulerPage.tsx  # Admin scheduling page
├── hooks/
│   ├── useVoiceInterview.ts            # Main orchestrator hook
│   ├── useAudioStreaming.ts            # MediaRecorder → WS audio chunks
│   ├── useAudioPlayback.ts            # Web Audio API playback
│   ├── useQuestionTimer.ts            # Per-question countdown
│   ├── useTimer.ts                    # Global countdown timer
│   ├── useFullscreen.ts               # Fullscreen API + exit detection
│   ├── usePageVisibility.ts           # Tab switch detection
│   ├── useFaceDetection.ts            # face-api.js face monitoring
│   ├── useDevToolsDetection.ts        # DevTools open detection
│   ├── useMediaRecorder.ts            # Video recording
│   ├── useSpeechRecognition.ts        # Browser speech recognition
│   └── useSpeechSynthesis.ts          # Browser TTS for instructions
├── services/
│   ├── interview-ws.service.ts        # STOMP WebSocket client singleton
│   ├── interview.service.ts           # REST API calls (admin)
│   ├── ai.service.ts                  # REST API calls (interview actions)
│   └── api.service.ts                 # Axios instance + interceptors
├── types/
│   └── interview.types.ts             # All TypeScript interfaces
├── config/
│   ├── app.config.ts                  # Constants (timers, thresholds)
│   ├── api.endpoints.ts               # All REST endpoint URLs
│   └── env.ts                         # Environment variables
└── components/
    └── interview/
        ├── AIAvatar.tsx               # Animated AI avatar
        └── EvaluationBreakdown.tsx    # Evaluation display component
```

---

## Database Schema (Key Entities)

### `CandidateInterviewSchedule` (Main Table)
```sql
CREATE TABLE candidate_interview_schedule (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_prefix      VARCHAR(255),           -- Links to JobPost
  email           VARCHAR(255),           -- Links to Users
  attempt_status  ENUM('NOT_ATTEMPTED','IN_PROGRESS','COMPLETED'),
  interview_result ENUM('PENDING','PASSED','FAILED'),
  completion_reason ENUM('NATURAL_COMPLETION','EARLY_TERMINATION_POOR_PERFORMANCE',
                         'CANDIDATE_ENDED','PROCTORING_VIOLATION','TIMEOUT','MAX_SKIPS'),
  total_questions_asked INT DEFAULT 0,
  warning_count   INT DEFAULT 0,
  difficulty_level INT DEFAULT 2,
  running_summary TEXT,                   -- GPT-generated rolling summary
  evaluation_json LONGTEXT,              -- Full evaluation JSON from GPT
  interviewer_name VARCHAR(255) DEFAULT 'Sarah',
  record_references TEXT,                -- S3 URL for video recording
  summery_references TEXT,               -- Legacy summary text
  assigned_at     DATETIME,
  deadline_time   DATETIME,
  started_at      DATETIME,
  ended_at        DATETIME,
  current_phase   ENUM('INTRODUCTION')   -- Legacy, kept for DB compat
);
```

### `VoiceConversationEntry` (Conversation Log)
```sql
CREATE TABLE voice_conversation_entry (
  id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
  interview_schedule_id   BIGINT NOT NULL,  -- FK to CandidateInterviewSchedule
  role                    ENUM('SYSTEM','INTERVIEWER','CANDIDATE'),
  content                 TEXT NOT NULL,
  word_count              INT,
  words_per_minute        DOUBLE,
  filler_word_count       INT,
  confidence_score        DOUBLE,          -- 0-100
  speech_duration_seconds DOUBLE,
  timestamp               DATETIME DEFAULT NOW()
);
```

### `ProctoringEvent` (Violation Log)
```sql
CREATE TABLE proctoring_event (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  schedule_id BIGINT NOT NULL,             -- FK to CandidateInterviewSchedule
  event_type  VARCHAR(255),               -- 'tab_switch','no_face','multiple_faces','looking_away','devtools','fullscreen_exit'
  details     TEXT,
  timestamp   DATETIME DEFAULT NOW()
);
```

---

## REST API Endpoints

### Interview Management (Admin)
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/interview/assign-interview` | `INTERVIEW_ASSIGN` | Assign interview to single candidate |
| `POST` | `/api/interview/assign-interview-bulk` | `INTERVIEW_ASSIGN` | Assign interview to multiple candidates |
| `GET` | `/api/interview/results` | `INTERVIEW_ASSIGN` | Get all interview results (optional `?jobPrefix=`) |
| `GET` | `/api/interview/results/{id}` | `INTERVIEW_ASSIGN` | Get single interview detail |
| `GET` | `/api/interview/stats` | `INTERVIEW_ASSIGN` | Get aggregate stats (total, pass rate, avg score, avg duration) |
| `GET` | `/api/interview/{scheduleId}/proctoring-events` | `INTERVIEW_ASSIGN` | Get proctoring events for an interview |
| `GET` | `/api/interview/{scheduleId}/conversation` | `INTERVIEW_ASSIGN` | Get full conversation transcript |

### Interview Actions (Candidate)
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/interview/active?email=` | `INTERVIEW_START` | Get active interviews for candidate |
| `POST` | `/api/interview/voice/start` | `INTERVIEW_START` | Start voice interview → returns first question + audio |
| `POST` | `/api/interview/voice/{id}/end` | `INTERVIEW_ANSWER` | End interview manually |
| `GET` | `/api/interview/voice/{id}/status` | `INTERVIEW_START` | Get current interview status |
| `GET` | `/api/interview/voice/{id}/evaluation` | `INTERVIEW_START` | Get evaluation result |
| `GET` | `/api/interview/voice/{scheduleId}/resume` | `INTERVIEW_START` | Resume disconnected interview |
| `POST` | `/api/interview/{id}/video` | `INTERVIEW_ANSWER` | Upload video recording (multipart) |
| `POST` | `/api/interview/voice-to-text` | `INTERVIEW_ANSWER` | Convert audio file to text (Whisper) |

### Room Verification
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/interview/verification-session` | - | Create room verification session |
| `POST` | `/api/interview/verify-room` | - | Submit webcam image for AI verification |
| `GET` | `/api/interview/verification-status` | - | Check verification result |

---

## WebSocket Architecture

### Connection Setup
```
Frontend                           Backend
   |                                  |
   |-- SockJS connect to /ws?token=JWT -->
   |                                  |
   |            WebSocketAuthInterceptor
   |            validates JWT token
   |            stores userEmail in session attrs
   |                                  |
   |<-- STOMP CONNECTED frame --------|
   |                                  |
   |-- Subscribe to topics ---------->|
   |                                  |
```

### WebSocket Configuration (`WebSocketConfig.java`)
- **STOMP endpoint:** `/ws` (with SockJS fallback)
- **Application prefix:** `/app` (for client → server messages)
- **Broker prefixes:** `/topic`, `/queue` (for server → client messages)
- **Message size limit:** 1 MB (for TTS audio)
- **Send buffer:** 5 MB
- **Heartbeat:** 10 seconds (both directions)

### Client → Server Messages (via `/app/interview/{scheduleId}/...`)

| Destination | Payload | Handler Method | Purpose |
|---|---|---|---|
| `/app/interview/{id}/audio-chunk` | `{ audio: "base64..." }` | `handleAudioChunk()` | Send recorded audio for transcription |
| `/app/interview/{id}/submit-answer` | `{ transcript, wordTimestamps, skipped? }` | `handleSubmitAnswer()` | Submit candidate's answer |
| `/app/interview/{id}/interrupt` | `{ reason: "candidate_speaking" }` | `handleInterrupt()` | Candidate started speaking (interrupt AI audio) |
| `/app/interview/{id}/proctoring-event` | `{ type, details }` | `handleProctoringEvent()` | Report proctoring violation |

### Server → Client Messages (via `/topic/interview/{scheduleId}/...`)

| Topic | Payload | Source | Purpose |
|---|---|---|---|
| `/topic/interview/{id}/transcription` | `{ text, words, duration, chunkIndex }` | `AudioTranscriptionService` | Real-time speech-to-text result |
| `/topic/interview/{id}/transcription-error` | `{ error, chunkIndex? }` | Various | Transcription failure notification |
| `/topic/interview/{id}/ai-token` | `{ token, done, fullText? }` | `VoiceInterviewServiceImpl` | Streaming GPT response token-by-token |
| `/topic/interview/{id}/filler` | `{ text, type: "filler" }` | `VoiceInterviewServiceImpl` | Filler message while AI thinks |
| `/topic/interview/{id}/response-complete` | `{ questionsAsked, isComplete, terminated?, error? }` | `VoiceInterviewServiceImpl` | AI finished responding, ready for next answer |
| `/topic/interview/{id}/tts-audio` | `{ audio: "base64mp3", chunkIndex, isLast, text }` | `TextToSpeechService` | TTS audio chunk for playback |
| `/topic/interview/{id}/tts-fallback` | `{ text }` | `TextToSpeechService` | Fallback when TTS fails (use browser TTS) |

---

## Detailed Technical Flows

### Flow 1: Starting the Interview

```
InterviewPage.tsx
  └─ handleStartInterview()
      ├─ enterFullscreen()
      ├─ loadModels()  (face-api.js)
      └─ voiceInterview.startInterview({ email, jobPrefix })
          └─ useVoiceInterview.ts → startInterview()
              ├─ setState('starting')
              ├─ POST /api/interview/voice/start ──────────────────────────>
              │   └─ InterviewController.startVoiceInterview()
              │       └─ VoiceInterviewServiceImpl.startVoiceInterview()
              │           ├─ scheduleRepo.findFirstByJobPrefixAndEmail()
              │           ├─ schedule.setAttemptStatus(IN_PROGRESS)
              │           ├─ schedule.setStartedAt(now)
              │           ├─ contextService.buildFirstQuestionPrompt()
              │           ├─ contextService.buildContextMessages()
              │           │   └─ jobPromptService.getPrompt() ── fetch system prompt from DB
              │           ├─ openAiStreamingService.chatCompletion() ── GPT-4o generates 1st question
              │           ├─ entryRepository.save() ── save question to conversation log
              │           ├─ textToSpeechService.generateTTSBase64() ── TTS-1-HD generates audio
              │           └─ return VoiceStartResponse { scheduleId, firstQuestion, audio, interviewerName }
              │   <───────────────────────────────────────────────────────────
              ├─ setScheduleId(response.scheduleId)
              ├─ setConversation([first question])
              ├─ interviewWsService.connect(scheduleId, onConnected, onDisconnected)
              │   └─ new Client({ webSocketFactory: () => new SockJS(url) })
              │       └─ onConnect → setupSubscriptions()
              │           ├─ subscribe('transcription', handler)
              │           ├─ subscribe('ai-token', handler)
              │           ├─ subscribe('tts-audio', handler)
              │           ├─ subscribe('tts-fallback', handler)
              │           ├─ subscribe('filler', handler)
              │           ├─ subscribe('response-complete', handler)
              │           └─ subscribe('transcription-error', handler)
              ├─ enqueueAudio(firstQuestionAudio) ── play first question
              └─ setState('active')
```

### Flow 2: Recording and Submitting an Answer

```
Candidate clicks MIC button
  └─ voiceInterview.startAnswering()
      ├─ audioPlayback.stopPlayback()  ── stop AI voice if playing
      ├─ interviewWsService.send('interrupt', {reason: 'candidate_speaking'})
      ├─ audioStreaming.startRecording()
      │   ├─ getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })
      │   ├─ new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      │   ├─ recorder.start()  ── start recording
      │   ├─ setInterval(rotateRecorder, 4000)  ── every 4 sec:
      │   │   ├─ recorder.stop()  ── fires ondataavailable with complete audio blob
      │   │   │   └─ sendChunk(blob)
      │   │   │       └─ blob.arrayBuffer()
      │   │   │           └─ interviewWsService.sendBinary('audio-chunk', buffer)
      │   │   │               └─ base64 encode → JSON { audio: "base64..." }
      │   │   │                   └─ STOMP publish to /app/interview/{id}/audio-chunk ─────>
      │   │   │                       └─ VoiceInterviewWebSocketController.handleAudioChunk()
      │   │   │                           ├─ verifyOwnership(scheduleId, headerAccessor)
      │   │   │                           ├─ Base64.decode(audio)
      │   │   │                           ├─ size check (max 200KB)
      │   │   │                           └─ audioTranscriptionService.transcribeAsync()  [@Async]
      │   │   │                               ├─ openAiStreamingService.transcribe(audioData)
      │   │   │                               │   └─ POST https://api.openai.com/v1/audio/transcriptions
      │   │   │                               │       ├─ model: whisper-1
      │   │   │                               │       ├─ response_format: verbose_json
      │   │   │                               │       └─ timestamp_granularities: word
      │   │   │                               └─ messagingTemplate.convertAndSend(
      │   │   │                                      /topic/interview/{id}/transcription,
      │   │   │                                      { text, words, duration, chunkIndex })
      │   │   │                                   <──── arrives at frontend ────
      │   │   │                                   └─ transcriptRef.current += msg.text
      │   │   │                                       setCurrentTranscript(...)
      │   │   └─ new MediaRecorder(stream)  ── start fresh recorder
      │   └─ startLevelMonitoring(stream)  ── AnalyserNode for audio level bar
      └─ setState('answering')

Candidate clicks STOP button
  └─ voiceInterview.submitAnswer()
      ├─ audioStreaming.stopRecording()  ── flushes final chunk
      ├─ wait for final transcription (up to 3s)
      ├─ setConversation(prev => [...prev, { role: 'candidate', content: transcript }])
      ├─ interviewWsService.send('submit-answer', { transcript, wordTimestamps })
      │   └─ STOMP publish to /app/interview/{id}/submit-answer ────────────────>
      │       └─ (see Flow 3)
      └─ setState('processing')
```

### Flow 3: Processing Answer and Generating Next Question

```
VoiceInterviewWebSocketController.handleSubmitAnswer()
  ├─ verifyOwnership(scheduleId, headerAccessor)
  ├─ deduplication check (skip if same transcript within 60s)
  └─ voiceInterviewService.processVoiceAnswer(scheduleId, request)
      └─ VoiceInterviewServiceImpl.processVoiceAnswer()

          Phase 1 — Short TX (~50ms): Validate + Save Answer
          ├─ scheduleRepo.findById() + verify IN_PROGRESS
          ├─ if skipped:
          │   └─ save entry with content = "[NO RESPONSE - SKIPPED]"
          ├─ else:
          │   ├─ toneAnalysisService.analyze(transcript, wordTimestamps, duration)
          │   │   ├─ count words → wordCount
          │   │   ├─ calculate WPM = (words / duration) * 60
          │   │   ├─ count filler words (um, uh, like, etc.) → fillerWordCount
          │   │   ├─ analyze pauses from word timestamps → avgPauseDuration, longPauses
          │   │   └─ calculate confidenceScore (0-100):
          │   │       = paceScore*0.3 + fillerScore*0.3 + pauseScore*0.2 + lengthScore*0.2
          │   └─ save VoiceConversationEntry with all metrics
          └─ if not skipped: sendFiller()
              └─ messagingTemplate → /topic/interview/{id}/filler

          Phase 2 — No TX: OpenAI Calls (3-30s)
          ├─ contextService.updateRunningSummary(schedule)
          │   ├─ get all conversation entries
          │   ├─ if entries > contextWindowSize*2 (default 8):
          │   │   ├─ take entries[0..n-8] (older entries)
          │   │   ├─ GPT-4o summarize in 200 words
          │   │   └─ save summary to schedule.runningSummary
          │   └─ else: return null (not enough to summarize yet)
          │
          ├─ performanceAnalyzer.analyze(schedule)
          │   ├─ count total skips, consecutive skips
          │   ├─ calculate avg word count, avg confidence score
          │   ├─ check skip ratio, consecutive poor answers
          │   └─ determine earlyTerminationSuggested (boolean)
          │
          ├─ contextService.buildNextQuestionPrompt()
          │   ├─ if skipped: "Candidate didn't respond, acknowledge and ask next"
          │   └─ else: "Candidate answered: '{transcript}'"
          │
          ├─ contextService.buildContextMessages(schedule, prompt)
          │   ├─ [system] System prompt from DB (via jobPromptService)
          │   ├─ [system] "Summary of earlier conversation: {runningSummary}" (if exists)
          │   ├─ [system] Performance guidance (if candidate struggling, hidden from AI output)
          │   ├─ [assistant/user] Last N Q&A pairs verbatim (contextWindowSize * 2 entries)
          │   └─ [user] Current prompt
          │
          └─ openAiStreamingService.streamChatCompletion(messages, onToken, onComplete)
              │
              │   POST https://api.openai.com/v1/chat/completions (stream=true)
              │   model: gpt-4o, temperature: 0.7, max_tokens: 500
              │
              ├─ onToken(token):
              │   └─ messagingTemplate → /topic/interview/{id}/ai-token { token, done:false }
              │       <──── arrives at frontend ────
              │       └─ streamingTextRef += token → show in conversation bubble
              │
              └─ onComplete(fullText):

                  Phase 3 — Short TX (~50ms): Save Interviewer Response
                  ├─ check for [INTERVIEW_COMPLETE] marker → isComplete
                  ├─ send final ai-token { done:true, fullText }
                  │   <──── arrives at frontend ────
                  │   └─ add full interviewer entry to conversation
                  ├─ save VoiceConversationEntry(role=INTERVIEWER, content=cleanedText)
                  ├─ schedule.incrementQuestionsAsked()
                  ├─ if isComplete:
                  │   ├─ schedule.setAttemptStatus(COMPLETED)
                  │   ├─ schedule.setEndedAt(now)
                  │   └─ schedule.setCompletionReason(...)
                  ├─ send response-complete { questionsAsked, isComplete }
                  │   <──── arrives at frontend ────
                  │   └─ setState(isComplete ? 'completed' : 'active')
                  │
                  ├─ textToSpeechService.generateAndStreamTTS(scheduleId, text) [@Async]
                  │   ├─ splitIntoSentences(text)
                  │   ├─ batchSentences(sentences, 3)  ── group 3 sentences per API call
                  │   └─ for each batch:
                  │       ├─ openAiStreamingService.textToSpeech(batch)
                  │       │   └─ POST https://api.openai.com/v1/audio/speech
                  │       │       model: tts-1-hd, voice: nova, format: mp3
                  │       ├─ base64 encode the MP3 bytes
                  │       └─ messagingTemplate → /topic/interview/{id}/tts-audio
                  │           { audio: "base64mp3", chunkIndex, isLast, text }
                  │           <──── arrives at frontend ────
                  │           └─ audioPlayback.enqueueAudio()
                  │               ├─ atob(base64) → ArrayBuffer
                  │               ├─ AudioContext.decodeAudioData()
                  │               ├─ AudioBufferSourceNode.start()
                  │               └─ play sequentially (queue)
                  │
                  └─ if isComplete:
                      └─ evaluationService.triggerEvaluationAsync() [@Async]
                          └─ (see Flow 4)
```

### Flow 4: Evaluation Generation

```
InterviewEvaluationService.evaluateInterview(scheduleId)
  ├─ scheduleRepo.findById()
  ├─ check cached evaluation → return if exists
  ├─ entryRepository.findAllByScheduleId()
  │
  ├─ Build transcript string:
  │   "Position: JAVA-2024\nCandidate: user@email.com\n\n"
  │   "Sarah: [question]\n\nCandidate: [answer]\n\n..."
  │
  ├─ buildEvaluationPrompt():
  │   ├─ categoryFormatter.buildEvaluationCategorySection(jobPrefix)
  │   │   └─ fetch evaluation categories from DB for this job
  │   ├─ load custom SUMMARY prompt from DB (if exists)
  │   ├─ add early termination context (if applicable)
  │   └─ construct full prompt requesting JSON output:
  │       {
  │         overallScore: 0-10,
  │         recommendation: "STRONG_HIRE|HIRE|LEAN_HIRE|LEAN_NO_HIRE|NO_HIRE",
  │         summary: "...",
  │         strengths: [...],
  │         areasForImprovement: [...],
  │         categoryScores: [{ category, score, weight, feedback }]
  │       }
  │
  ├─ openAiStreamingService.chatCompletion(messages)
  │   └─ POST https://api.openai.com/v1/chat/completions
  │       model: gpt-4o, temperature: 0.7, max_tokens: 2000
  │
  ├─ parseEvaluation(json) → VoiceEvaluationResult
  │
  ├─ calculateSpeechAnalysis(entries):
  │   ├─ avg WPM across candidate entries
  │   ├─ total filler words
  │   ├─ avg confidence score
  │   ├─ paceAssessment: "Excellent" (120-160 WPM) / "Slow" / "Fast"
  │   └─ articulationFeedback: based on filler count
  │
  ├─ schedule.setEvaluationJson(json)
  ├─ determine PASSED/FAILED:
  │   ├─ STRONG_HIRE, HIRE, LEAN_HIRE → PASSED
  │   └─ LEAN_NO_HIRE, NO_HIRE → FAILED
  └─ scheduleRepo.save()

Frontend polling for evaluation:
  └─ useVoiceInterview.fetchEvaluation()
      ├─ retry up to 10 times with exponential backoff (3s → 15s)
      └─ GET /api/interview/voice/{id}/evaluation
```

### Flow 5: Proctoring Event Handling

```
Frontend proctoring hooks detect violation:
  ├─ usePageVisibility → onHidden() → tab switch
  ├─ useFaceDetection → onNoFace() / onMultipleFaces() / onLookingAway()
  ├─ useFullscreen → onExitAttempt()
  └─ useDevToolsDetection → detectionCount increment

Each violation:
  ├─ showToast(warning message)
  ├─ voiceInterview.sendProctoringEvent(type, details)
  │   └─ interviewWsService.send('proctoring-event', { type, details })
  │       └─ STOMP → /app/interview/{id}/proctoring-event ──────────────>
  │           └─ VoiceInterviewWebSocketController.handleProctoringEvent()
  │               ├─ verifyOwnership()
  │               ├─ ProctoringEvent.builder()
  │               │   .schedule(scheduleRef)
  │               │   .eventType(type)  // 'tab_switch','no_face','multiple_faces',
  │               │                     // 'looking_away','devtools','fullscreen_exit'
  │               │   .details(details)
  │               │   .build()
  │               ├─ proctoringEventRepository.save(event)
  │               └─ voiceInterviewService.handleWarning(scheduleId)
  │                   ├─ schedule.addWarning()  ── warningCount++
  │                   ├─ if warningCount >= 5:
  │                   │   ├─ schedule.setAttemptStatus(COMPLETED)
  │                   │   ├─ schedule.setInterviewResult(FAILED)
  │                   │   ├─ schedule.setCompletionReason(PROCTORING_VIOLATION)
  │                   │   └─ return true (terminated)
  │                   └─ else: return false
  │
  │           if terminated:
  │               └─ messagingTemplate → /topic/interview/{id}/response-complete
  │                   { isComplete:true, terminated:true, reason:"Maximum warnings exceeded" }
  │
  └─ Frontend also tracks totalWarnings locally
      └─ if totalWarnings >= INTERVIEW_MAX_PROCTORING_WARNINGS (5):
          └─ runPostCompletionFlow()
```

### Flow 6: Post-Completion Flow (Frontend)

```
runPostCompletionFlow(skipEndCall)
  ├─ setPostCompletionStep('ending')
  ├─ if !skipEndCall:
  │   └─ voiceInterview.endInterview()
  │       ├─ audioStreaming.stopRecording()
  │       ├─ audioPlayback.stopPlayback()
  │       └─ POST /api/interview/voice/{id}/end ─────────────────>
  │           └─ VoiceInterviewServiceImpl.endVoiceInterview()
  │               ├─ schedule.setAttemptStatus(COMPLETED)
  │               ├─ schedule.setEndedAt(now)
  │               ├─ schedule.setCompletionReason(CANDIDATE_ENDED)
  │               └─ evaluationService.triggerEvaluationAsync()
  │
  ├─ stopDetection() ── stop face detection
  │
  ├─ setPostCompletionStep('uploading-video')
  ├─ stopAndGetBlob() ── stop video recording → get full video blob
  ├─ POST /api/interview/{id}/video (multipart) ──────────────────>
  │   └─ InterviewController.uploadInterviewVideo()
  │       └─ interviewService.storeRecording()
  │           ├─ storageService.uploadFile(prefix, blobName, videoFile)
  │           │   └─ Upload to AWS S3 bucket 'airightpath-interview'
  │           └─ schedule.setRecordReferences(s3Url)
  │
  ├─ setPostCompletionStep('done')
  └─ navigate(ROUTES.CANDIDATE.INTERVIEWS) ── redirect
```

---

## Async Threading Model

| Thread Pool | Used By | Purpose |
|---|---|---|
| `transcriptionExecutor` | `AudioTranscriptionService.transcribeAsync()` | Whisper transcription (parallel per chunk) |
| `transcriptionExecutor` | `InterviewEvaluationService.triggerEvaluationAsync()` | Post-interview evaluation generation |
| `ttsExecutor` | `TextToSpeechService.generateAndStreamTTS()` | TTS audio generation (parallel sentence batches) |

The main `processVoiceAnswer()` method uses **3-phase transaction splitting**:
- **Phase 1** (~50ms): Short DB transaction to validate + save candidate answer
- **Phase 2** (3-30s): No transaction — OpenAI API calls (summary, question generation)
- **Phase 3** (~50ms): Short DB transaction to save interviewer response

This prevents long-running OpenAI calls from holding database connections.

---

## Scheduled Tasks

| Task | Frequency | Class | Purpose |
|---|---|---|---|
| Interview timeout enforcement | Every 5 minutes | `VoiceInterviewServiceImpl.enforceInterviewTimeouts()` | Auto-complete interviews IN_PROGRESS for >60 min |
| Dedup cleanup | Every 5 minutes | `VoiceInterviewWebSocketController` (daemon thread) | Clean expired answer deduplication entries |

---

## OpenAI API Calls Summary

| API | Endpoint | Model | When Called | Timeout |
|---|---|---|---|---|
| Chat Completion (streaming) | `/v1/chat/completions` | `gpt-4o` | Generating next question | 120s read |
| Chat Completion (non-streaming) | `/v1/chat/completions` | `gpt-4o` | Evaluation, summary, first question | 120s read |
| Audio Transcription | `/v1/audio/transcriptions` | `whisper-1` | Each 4-second audio chunk | 120s read |
| Text to Speech | `/v1/audio/speech` | `tts-1-hd` | Each 2-3 sentence batch | 60s write |
| Vision | `/v1/chat/completions` | `gpt-4o` | Room verification image | default |

---

## Key Configuration Files

| File | Location | What It Contains |
|---|---|---|
| `application.properties` | `rightpath-be/src/main/resources/` | Active profile selector |
| `application-dev.properties` | `rightpath-be/src/main/resources/` | All dev config: DB, OpenAI keys, S3, email, interview settings |
| `interview-prompts.properties` | `rightpath-be/src/main/resources/` | Default interview prompts (system, start, summary) |
| `app.config.ts` | `rightpath-ui/src/config/` | Frontend constants (timers, thresholds, limits) |
| `api.endpoints.ts` | `rightpath-ui/src/config/` | All REST endpoint URL patterns |
| `env.ts` | `rightpath-ui/src/config/` | Environment variables (API_BASE_URL, WS_URL) |

---

## Error Handling & Recovery

### WebSocket Disconnection
- `interview-ws.service.ts` has built-in reconnection (up to 10 attempts)
- Messages queued during disconnection (up to 200 pending messages)
- On reconnect: all subscriptions are re-established automatically
- Frontend shows "Connection lost" banner with reconnect attempt count

### Processing Timeout
- Frontend has a 45-second safety timeout for processing answers
- If `response-complete` message never arrives, UI recovers to `active` state
- User can retry answering

### Evaluation Polling
- Evaluation is generated asynchronously (may take 10-30 seconds)
- Frontend polls with exponential backoff: 3s → 4.5s → 6.75s → ... up to 15s, max 10 retries

### Audio Fallback
- If OpenAI TTS fails, falls back to browser's built-in `SpeechSynthesis` API
- TTS fallback message sent via `/topic/interview/{id}/tts-fallback`

---

## Security Architecture

### Authentication Flow
```
1. User logs in → receives JWT access token + refresh token (httpOnly cookie)
2. REST API calls: Authorization: Bearer <accessToken>
3. WebSocket: /ws?token=<accessToken> (query parameter)
4. WebSocketAuthInterceptor validates token at handshake:
   - Extracts from query param OR Authorization header
   - Validates via AccessTokenService
   - Stores userEmail + authorities in WS session attributes
5. Each WS message handler: verifyOwnership(scheduleId, headerAccessor)
   - Checks session attribute userEmail
   - Verifies schedule belongs to that user via DB query
```

### RBAC Permissions
| Permission | Who Has It | What It Allows |
|---|---|---|
| `INTERVIEW_ASSIGN` | Admin | Schedule interviews, view results, view proctoring |
| `INTERVIEW_START` | Candidate | Start interview, view status, view evaluation |
| `INTERVIEW_ANSWER` | Candidate | Submit answers, upload video |
