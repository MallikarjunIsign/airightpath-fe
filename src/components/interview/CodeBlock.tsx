import Editor from '@monaco-editor/react';

interface CodeBlockProps {
  code: string;
  language?: string;
  maxHeight?: number;
}

const MONACO_LANGUAGE_MAP: Record<string, string> = {
  java: 'java',
  python: 'python',
  c: 'c',
  cpp: 'cpp',
  javascript: 'javascript',
};

export function CodeBlock({ code, language = 'text', maxHeight = 250 }: CodeBlockProps) {
  const lineCount = code.split('\n').length;
  const height = Math.min(lineCount * 20 + 16, maxHeight);

  return (
    <div className="mt-2 border border-[#3c3c3c] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-[#3c3c3c]">
        <span className="text-xs text-gray-400 font-mono">{language}</span>
      </div>
      <Editor
        height={`${height}px`}
        language={MONACO_LANGUAGE_MAP[language] || 'plaintext'}
        value={code}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'on',
          domReadOnly: true,
          padding: { top: 4 },
          scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
        }}
      />
    </div>
  );
}
