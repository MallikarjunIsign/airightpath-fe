# AI Voice Interview - How It Works

## Overview

The interview is a real-time voice conversation between a candidate and an AI interviewer. The AI decides what to ask, when to go deeper, and when to end the interview — all based on prompts stored in the database. No questions or phases are hardcoded.

---

## Setup (Admin Side)

Before any interview can happen, an admin creates two prompts in the **JobPrompt** table for each job position:

1. **START prompt** (type=INTERVIEW, stage=START)
   - This is the "personality" and instructions for the AI interviewer.
   - It tells the AI who it is, what role it's interviewing for, and how to behave.
   - Supports placeholders: `{{email}}` (candidate's email) and `{{jobPrefix}}` (job title/code).
   - Example: *"You are Sarah, a senior interviewer for {{jobPrefix}}. The candidate is {{email}}. Ask questions about React, Node.js, and system design. When you feel the interview is complete, include [INTERVIEW_COMPLETE] in your response."*

2. **SUMMARY prompt** (type=INTERVIEW, stage=SUMMARY)
   - This tells the AI how to evaluate the interview after it ends.
   - Supports placeholder: `{{transcript}}` (the full conversation).
   - Example: *"Evaluate this interview transcript and return a JSON with scores, recommendation, strengths, and areas for improvement. Transcript: {{transcript}}"*

---

## Interview Flow (Step by Step)

### Step 1: Candidate Starts the Interview

- Candidate clicks "Start Interview" on the web page.
- The browser goes fullscreen and starts video recording (for proctoring).
- The backend fetches the **START prompt** from the database, fills in `{{email}}` and `{{jobPrefix}}`, and sends it to OpenAI.
- OpenAI responds with a greeting/first question.
- The candidate hears the AI speak (text-to-speech) and sees the text on screen.

### Step 2: Candidate Answers

- Candidate clicks the microphone button and speaks.
- Their speech is transcribed in real-time (they see their words appearing on screen).
- When done, they click the stop button to submit their answer.

### Step 3: AI Responds

- The backend sends the full conversation context to OpenAI:
  - The system prompt (from the database)
  - A summary of older conversation (if the conversation is long)
  - The last few exchanges word-for-word
  - The candidate's latest answer
- OpenAI streams back its next response (the candidate sees it typing in real-time and hears it spoken).
- The AI naturally decides what to ask next — follow-ups, new topics, deeper questions — all based on the prompt and conversation history.

### Step 4: Repeat

Steps 2-3 repeat as many times as the AI sees fit. There are no fixed phases, no fixed number of questions, and no fixed difficulty levels. The AI controls the flow entirely.

### Step 5: AI Ends the Interview

When the AI decides the interview is complete, it includes a special marker `[INTERVIEW_COMPLETE]` in its response. The backend:

- Strips the marker so the candidate never sees it.
- Sends the final message to the candidate (usually a thank-you/closing).
- Marks the interview as completed.
- Triggers the evaluation process.

### Step 6: Evaluation

- The backend fetches the **SUMMARY prompt** from the database.
- It builds the full transcript and fills in the `{{transcript}}` placeholder.
- OpenAI evaluates the interview and returns scores, recommendation, strengths, and areas for improvement.
- The candidate is redirected to a summary page showing their results.

---

## Other Ways the Interview Can End

The AI ending the interview is the normal path. But there are fallback endings too:

| Trigger | What Happens |
|---|---|
| **Timer expires** (60 min) | Frontend ends the interview automatically |
| **Candidate clicks "End"** | Confirmation dialog, then interview ends |
| **Too many proctoring warnings** | Interview is terminated and marked as failed |

Proctoring warnings are triggered by:
- Switching browser tabs
- Exiting fullscreen
- Face not detected on camera
- Opening developer tools

---

## What the Candidate Sees

- A clean interview page with an AI avatar, conversation bubbles, and a mic button.
- A timer counting down from 60 minutes.
- A question counter (`Q: 3`) showing how many questions have been asked.
- A proctoring warning counter.
- After completion: a summary page with their score, strengths, areas for improvement, and speech analysis (words per minute, filler words, confidence).

---

## Key Design Decisions

| Before | After |
|---|---|
| 6 hardcoded phases (Introduction, Background, Technical, etc.) | AI decides the flow dynamically |
| 18 fixed questions across phases | AI asks as many questions as needed |
| Difficulty levels 1-5 adjusted by code | AI naturally adjusts based on conversation |
| Hardcoded system prompt in Java code | System prompt stored in database, editable by admin |
| Hardcoded evaluation criteria in Java code | Evaluation prompt stored in database, editable by admin |
| Backend decides when to end (phase count) | AI decides when to end (`[INTERVIEW_COMPLETE]` marker) |

---

## Tech Stack Summary

- **Frontend**: React + TypeScript, WebSocket for real-time communication
- **Backend**: Spring Boot (Java), WebSocket (STOMP)
- **AI**: OpenAI GPT-4o for conversation and evaluation
- **Speech**: OpenAI Whisper for transcription, OpenAI TTS for AI voice
- **Database**: MySQL — stores prompts, schedules, conversation entries, and evaluations
