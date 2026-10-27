import { useCallback, useRef, useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { APP_CONFIG } from '@/config/app.config';
import { Code2, ChevronsUpDown, Maximize2, Minimize2 } from 'lucide-react';

interface CodingEditorProps {
  code: string;
  language: string;
  onCodeChange: (code: string) => void;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}

const MONACO_LANGUAGE_MAP: Record<string, string> = {
  java: 'java',
  python: 'python',
  c: 'c',
  cpp: 'cpp',
  javascript: 'javascript',
};

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 900;

/**
 * Preferred heights as a share of the viewport, not fixed pixels.
 *
 * A flat 300px is a comfortable editor on a laptop and almost the whole
 * window on a phone held in landscape, where it pushed the answer controls
 * off-screen; the 620px "Expand" was worse. Deriving from the viewport keeps
 * the same proportions on every screen, and re-deriving on resize means
 * rotating the phone cannot leave a 620px editor in a 360px-tall window.
 */
const DEFAULT_RATIO = 0.3;
const TALL_RATIO = 0.55;
const CAP_RATIO = 0.6;

const measure = () => {
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const at = (ratio: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(vh * ratio)));
  return { base: at(DEFAULT_RATIO), tall: at(TALL_RATIO), max: at(CAP_RATIO) };
};

export function CodingEditor({ code, language, onCodeChange, onLanguageChange, disabled }: CodingEditorProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [limits, setLimits] = useState(measure);
  /**
   * The editor is resizable because one height is wrong for everyone: on a
   * laptop the default crowded out the transcript, and on a long answer it
   * left the candidate scrolling a ten-line window. They drag it to what
   * their answer needs; double-clicking the grip puts it back.
   */
  const [height, setHeight] = useState(() => measure().base);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      const next = measure();
      setLimits(next);
      // Re-clamp rather than reset: a candidate who dragged the editor to a
      // size that still fits keeps it across a rotate.
      setHeight((h) => Math.min(next.max, Math.max(MIN_HEIGHT, h)));
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      onCodeChange(value ?? '');
    },
    [onCodeChange]
  );

  const clamp = useCallback(
    (value: number) => Math.min(limits.max, Math.max(MIN_HEIGHT, value)),
    [limits.max]
  );

  // Pointer events rather than mouse, so a drag works on a touchscreen too,
  // and setPointerCapture keeps the drag alive when the cursor leaves the grip.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setHeight(clamp(drag.startHeight + (e.clientY - drag.startY)));
  }, [clamp]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const isTall = height >= limits.tall;

  return (
    <div className="w-full min-w-0 max-w-full border border-[var(--border)] rounded-xl overflow-hidden bg-[#1e1e1e] shadow-sm">
      {/* Header with language selector */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-2 sm:px-3 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex min-w-0 items-center gap-1.5">
          <Code2 size={14} className="shrink-0 text-blue-400" />
          <span className="truncate text-xs font-medium text-gray-300">Code Editor</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setHeight(isTall ? limits.base : limits.tall)}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-gray-400 hover:bg-[#3c3c3c] hover:text-gray-200 transition-colors sm:px-2"
            title={isTall ? 'Shrink editor' : 'Expand editor'}
            aria-label={isTall ? 'Shrink editor' : 'Expand editor'}
          >
            {isTall ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span className="hidden sm:inline">{isTall ? 'Shrink' : 'Expand'}</span>
          </button>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            disabled={disabled}
            aria-label="Programming language"
            className="min-w-0 max-w-[9rem] truncate text-xs bg-[#3c3c3c] text-gray-200 border border-[#555] rounded px-1.5 py-1 outline-none focus:border-blue-500 disabled:opacity-50 sm:px-2"
          >
            {APP_CONFIG.COMPILER_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Editor */}
      {isMobile ? (
        <textarea
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          disabled={disabled}
          placeholder="Write your code here..."
          style={{ height }}
          // text-base, not text-sm: iOS Safari zooms the whole page in on any
          // input under 16px, and the candidate then has to pinch back out to
          // reach the answer controls.
          className="block w-full max-w-full p-3 bg-[#1e1e1e] text-gray-200 font-mono text-base leading-relaxed resize-none outline-none disabled:opacity-50"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
      ) : (
        <Editor
          height={height}
          width="100%"
          language={MONACO_LANGUAGE_MAP[language] || 'plaintext'}
          value={code}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            readOnly: disabled,
            wordWrap: 'on',
            tabSize: 4,
            padding: { top: 8 },
            // Monaco reserves a gutter wide enough for folding arrows and
            // decorations it never draws here; on a narrow split that is
            // several characters of code lost on every line.
            folding: false,
            glyphMargin: false,
            lineDecorationsWidth: 4,
            lineNumbersMinChars: 3,
            overviewRulerLanes: 0,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      )}

      {/* Resize grip */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize code editor"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setHeight(limits.base)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); setHeight((h) => clamp(h - 40)); }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHeight((h) => clamp(h + 40)); }
        }}
        className="group flex h-5 cursor-ns-resize touch-none select-none items-center justify-center bg-[#252526] border-t border-[#3c3c3c] hover:bg-[#333] focus:outline-none focus:bg-[#333]"
        title="Drag to resize — double-click to reset"
      >
        <ChevronsUpDown size={12} className="text-gray-500 group-hover:text-gray-300" />
      </div>
    </div>
  );
}
