import { useCallback, useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { APP_CONFIG } from '@/config/app.config';
import { Code2 } from 'lucide-react';

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

export function CodingEditor({ code, language, onCodeChange, onLanguageChange, disabled }: CodingEditorProps) {
  const [isMobile, setIsMobile] = useState(false);

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

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[#1e1e1e]">
      {/* Header with language selector */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-blue-400" />
          <span className="text-xs font-medium text-gray-300">Code Editor</span>
        </div>
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

      {/* Editor */}
      {isMobile ? (
        <textarea
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          disabled={disabled}
          placeholder="Write your code here..."
          className="w-full h-[300px] p-3 bg-[#1e1e1e] text-gray-200 font-mono text-sm resize-none outline-none disabled:opacity-50"
          spellCheck={false}
        />
      ) : (
        <Editor
          height="300px"
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
    </div>
  );
}
