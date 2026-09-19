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

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 900;
const TALL_HEIGHT = 620;

export function CodingEditor({ code, language, onCodeChange, onLanguageChange, disabled }: CodingEditorProps) {
  const [isMobile, setIsMobile] = useState(false);
  /**
   * The editor is resizable because a fixed 300px box is wrong for everyone:
   * on a laptop it crowded out the transcript, and on a long answer it left
   * the candidate scrolling a ten-line window. They drag it to what their
   * answer needs; double-clicking the grip puts it back.
   */
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      onCodeChange(value ?? '');
    },
    [onCodeChange]
  );

  const clamp = (value: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));

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
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const isTall = height >= TALL_HEIGHT;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[#1e1e1e] shadow-sm">
      {/* Header with language selector */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-blue-400" />
          <span className="text-xs font-medium text-gray-300">Code Editor</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHeight(isTall ? DEFAULT_HEIGHT : TALL_HEIGHT)}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-400 hover:bg-[#3c3c3c] hover:text-gray-200 transition-colors"
            title={isTall ? 'Shrink editor' : 'Expand editor'}
          >
            {isTall ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span className="hidden sm:inline">{isTall ? 'Shrink' : 'Expand'}</span>
          </button>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            disabled={disabled}
            className="text-xs bg-[#3c3c3c] text-gray-200 border border-[#555] rounded px-2 py-1 outline-none focus:border-blue-500 disabled:opacity-50"
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
          className="w-full p-3 bg-[#1e1e1e] text-gray-200 font-mono text-sm resize-none outline-none disabled:opacity-50"
          spellCheck={false}
        />
      ) : (
        <Editor
          height={height}
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
        onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); setHeight((h) => clamp(h - 40)); }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHeight((h) => clamp(h + 40)); }
        }}
        className="group flex h-4 cursor-ns-resize touch-none select-none items-center justify-center bg-[#252526] border-t border-[#3c3c3c] hover:bg-[#333] focus:outline-none focus:bg-[#333]"
        title="Drag to resize — double-click to reset"
      >
        <ChevronsUpDown size={12} className="text-gray-500 group-hover:text-gray-300" />
      </div>
    </div>
  );
}
