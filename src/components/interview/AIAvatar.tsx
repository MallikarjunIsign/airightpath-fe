interface AIAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  amplitude?: number;
  currentWordIndex?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AIAvatar({
  isSpeaking,
  isListening,
  isThinking,
  amplitude = 0,
  currentWordIndex = 0,
  size = 'md',
  className = '',
}: AIAvatarProps) {
  const sizes = {
    sm: { container: 'w-24 h-24', head: 'w-20 h-20', eye: 'w-2.5 h-3', mouth: 'w-6', pulse: 'w-28 h-28' },
    md: { container: 'w-36 h-36', head: 'w-28 h-28', eye: 'w-3 h-3.5', mouth: 'w-8', pulse: 'w-44 h-44' },
    lg: { container: 'w-48 h-48', head: 'w-36 h-36', eye: 'w-4 h-5', mouth: 'w-10', pulse: 'w-56 h-56' },
  };

  const s = sizes[size];

  // Determine mouth state based on amplitude when available, fallback to word-index
  const getMouthClass = () => {
    if (isSpeaking) {
      if (amplitude > 0) {
        // Amplitude-based lip-sync
        if (amplitude > 0.6) return 'avatar-mouth-wide';
        if (amplitude > 0.3) return 'avatar-mouth-open';
        return 'avatar-mouth-idle';
      }
      // Fallback to word-index-based
      return currentWordIndex % 2 === 0 ? 'avatar-mouth-open' : 'avatar-mouth-wide';
    }
    if (isThinking) return 'avatar-mouth-thinking';
    if (isListening) return 'avatar-mouth-listening';
    return 'avatar-mouth-idle';
  };

  // Determine eye state
  const getEyebrowOffset = () => {
    if (isThinking) return '-translate-y-0.5';
    if (isListening) return 'translate-y-px';
    return '';
  };

  return (
    <div className={`relative flex items-center justify-center ${s.container} ${className}`}>
      {/* Pulse ring when speaking */}
      {isSpeaking && (
        <div
          className={`absolute ${s.pulse} rounded-full avatar-pulse-ring`}
          style={{
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
            transform: `scale(${1 + amplitude * 0.15})`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}

      {/* Listening glow ring */}
      {isListening && !isSpeaking && (
        <div
          className={`absolute ${s.pulse} rounded-full`}
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)',
            animation: 'avatar-breathe 3s ease-in-out infinite',
          }}
        />
      )}

      {/* Head */}
      <div
        className={`relative ${s.head} rounded-full flex items-center justify-center`}
        style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
          boxShadow: isSpeaking
            ? '0 0 30px rgba(99, 102, 241, 0.4), 0 8px 32px rgba(99, 102, 241, 0.2)'
            : '0 8px 32px rgba(99, 102, 241, 0.15)',
          animation: 'avatar-breathe 4s ease-in-out infinite',
        }}
      >
        {/* Face container */}
        <div
          className="relative flex flex-col items-center"
          style={{
            transform: isThinking ? 'rotate(-3deg)' : 'rotate(0deg)',
            transition: 'transform 0.5s ease',
          }}
        >
          {/* Eyebrows */}
          <div className={`flex gap-5 mb-1 transition-transform duration-300 ${getEyebrowOffset()}`}>
            <div
              className="w-4 h-0.5 rounded-full bg-white/60"
              style={{
                transform: isThinking ? 'rotate(-8deg)' : isListening ? 'rotate(5deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            />
            <div
              className="w-4 h-0.5 rounded-full bg-white/60"
              style={{
                transform: isThinking ? 'rotate(8deg)' : isListening ? 'rotate(-5deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
              }}
            />
          </div>

          {/* Eyes */}
          <div className="flex gap-5 mb-3">
            <div
              className={`${s.eye} rounded-full bg-white`}
              style={{ animation: 'avatar-blink 3.5s ease-in-out infinite' }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full bg-indigo-900 absolute"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
            <div
              className={`${s.eye} rounded-full bg-white`}
              style={{ animation: 'avatar-blink 3.5s ease-in-out infinite 0.1s' }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full bg-indigo-900 absolute"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
          </div>

          {/* Mouth */}
          <div className={`${s.mouth} flex justify-center`}>
            <div className={`transition-all duration-150 ${getMouthClass()}`} />
          </div>
        </div>
      </div>

      {/* Status label */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
        {isSpeaking && (
          <span className="text-xs font-medium text-indigo-400 animate-pulse whitespace-nowrap">
            Speaking...
          </span>
        )}
        {isThinking && !isSpeaking && (
          <span className="text-xs font-medium text-amber-400 animate-pulse whitespace-nowrap">
            Thinking...
          </span>
        )}
        {isListening && !isSpeaking && !isThinking && (
          <span className="text-xs font-medium text-emerald-400 whitespace-nowrap">
            Listening
          </span>
        )}
      </div>
    </div>
  );
}
