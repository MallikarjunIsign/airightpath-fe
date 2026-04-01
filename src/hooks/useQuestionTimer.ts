import { useState, useEffect, useRef, useCallback } from 'react';
import { APP_CONFIG } from '@/config/app.config';
import type { VoiceInterviewState } from '@/types/interview.types';

interface UseQuestionTimerOptions {
  state: VoiceInterviewState;
  isPlaying: boolean;
  isCodingQuestion: boolean;
  onTimeout: () => void;
  onMaxSkips: () => void;
}

export function useQuestionTimer({ state, isPlaying, isCodingQuestion, onTimeout, onMaxSkips }: UseQuestionTimerOptions) {
  const [secondsLeft, setSecondsLeft] = useState<number>(APP_CONFIG.INTERVIEW_QUESTION_TIMEOUT_SECONDS);
  const [consecutiveSkips, setConsecutiveSkips] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);

  const intervalRef = useRef<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const onMaxSkipsRef = useRef(onMaxSkips);
  onMaxSkipsRef.current = onMaxSkips;

  // Track previous state to detect new questions (transition into active+not-playing)
  const prevStateRef = useRef<VoiceInterviewState>(state);
  const prevIsPlayingRef = useRef(isPlaying);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTimerActive(false);
  }, []);

  const isCodingRef = useRef(isCodingQuestion);
  isCodingRef.current = isCodingQuestion;

  const startTimer = useCallback(() => {
    clearTimer();
    const timeout = isCodingRef.current
      ? APP_CONFIG.INTERVIEW_CODING_QUESTION_TIMEOUT_SECONDS
      : APP_CONFIG.INTERVIEW_QUESTION_TIMEOUT_SECONDS;
    setSecondsLeft(timeout);
    setIsTimerActive(true);

    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Fire the timeout callback and restart the countdown
          // instead of auto-skipping the question
          onTimeoutRef.current();
          return timeout;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const resetSkipCounter = useCallback(() => {
    setConsecutiveSkips(0);
  }, []);

  const incrementSkipCounter = useCallback(() => {
    setConsecutiveSkips((prev) => {
      const next = prev + 1;
      if (next >= APP_CONFIG.INTERVIEW_MAX_CONSECUTIVE_SKIPS) {
        // Defer the callback to avoid calling it during state update
        setTimeout(() => onMaxSkipsRef.current(), 0);
      }
      return next;
    });
  }, []);

  // Timer logic: start when active + not playing, stop otherwise
  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    const prevState = prevStateRef.current;
    prevStateRef.current = state;
    prevIsPlayingRef.current = isPlaying;

    if (state === 'active' && !isPlaying) {
      // Start/restart timer when:
      // 1. Just transitioned to active (from processing/starting/etc)
      // 2. TTS just finished (isPlaying went from true to false while active)
      const justBecameActive = prevState !== 'active';
      const ttsJustFinished = wasPlaying && !isPlaying;

      if (justBecameActive || ttsJustFinished) {
        startTimer();
      }
    } else {
      // Stop timer when candidate starts answering, processing, or TTS is playing
      clearTimer();
    }
  }, [state, isPlaying, startTimer, clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    secondsLeft,
    isTimerActive,
    consecutiveSkips,
    resetSkipCounter,
    incrementSkipCounter,
  };
}
