import { useState, useCallback, useRef } from 'react';

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isSpeakingWord, setIsSpeakingWord] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<number | null>(null);

  const clearKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const speak = useCallback((text: string, options?: { rate?: number; pitch?: number; lang?: string }) => {
    window.speechSynthesis.cancel();
    clearKeepAlive();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.rate ?? 1;
    utterance.pitch = options?.pitch ?? 1;
    utterance.lang = options?.lang ?? 'en-US';

    utterance.onstart = () => {
      setIsSpeaking(true);
      setCurrentWordIndex(0);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsSpeakingWord(false);
      setCurrentWordIndex(0);
      clearKeepAlive();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsSpeakingWord(false);
      clearKeepAlive();
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setCurrentWordIndex((prev) => prev + 1);
        setIsSpeakingWord(true);
        // Brief pulse per word
        setTimeout(() => setIsSpeakingWord(false), 150);
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);

    // Chrome workaround: Chrome pauses SpeechSynthesis after ~15s of continuous speech.
    // Periodic pause/resume keeps it alive.
    keepAliveRef.current = window.setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }, [clearKeepAlive]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    clearKeepAlive();
    setIsSpeaking(false);
    setIsSpeakingWord(false);
    setCurrentWordIndex(0);
  }, [clearKeepAlive]);

  return { isSpeaking, speak, stop, currentWordIndex, isSpeakingWord };
}
