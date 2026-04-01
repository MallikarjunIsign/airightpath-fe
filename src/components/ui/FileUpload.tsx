import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, X, FileText, Image, File as FileIcon } from 'lucide-react';
import { formatFileSize } from '@/utils/format.utils';

interface FileUploadProps {
  label?: string;
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  error?: string;
  helperText?: string;
  onChange?: (files: File[]) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return <Image size={20} />;
  if (type.includes('pdf') || type.includes('doc')) return <FileText size={20} />;
  return <FileIcon size={20} />;
}

export function FileUpload({
  label,
  accept,
  maxSizeBytes = 10 * 1024 * 1024,
  multiple = false,
  error,
  helperText,
  onChange,
  onError,
  disabled = false,
  className = '',
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > maxSizeBytes) {
      return `${file.name} exceeds the maximum size of ${formatFileSize(maxSizeBytes)}.`;
    }
    if (accept) {
      const acceptedTypes = accept.split(',').map((t) => t.trim());
      const isAccepted = acceptedTypes.some((type) => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.replace('/*', '/'));
        }
        return file.type === type;
      });
      if (!isAccepted) {
        return `${file.name} is not a supported file type.`;
      }
    }
    return null;
  };

  const processFiles = (incoming: FileList | File[]) => {
    const fileArray = Array.from(incoming);
    const validFiles: File[] = [];

    for (const file of fileArray) {
      const validationError = validateFile(file);
      if (validationError) {
        onError?.(validationError);
      } else {
        validFiles.push(file);
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          setPreviews((prev) => ({ ...prev, [file.name + file.size]: url }));
        }
      }
    }

    const newFiles = multiple ? [...files, ...validFiles] : validFiles.slice(0, 1);
    setFiles(newFiles);
    onChange?.(newFiles);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (index: number) => {
    const file = files[index];
    const key = file.name + file.size;
    if (previews[key]) {
      URL.revokeObjectURL(previews[key]);
      setPreviews((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onChange?.(newFiles);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-[var(--text)] mb-2">
          {label}
        </label>
      )}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center
          border-2 border-dashed rounded-2xl p-8 cursor-pointer
          transition-all duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragging
            ? 'border-[var(--primary)] bg-[var(--primaryMuted,var(--primaryLight))] scale-[1.01]'
            : error
              ? 'border-[var(--error)] bg-[var(--inputBg)]'
              : 'border-[var(--borderMuted,var(--inputBorder))] bg-[var(--inputBg)] hover:border-[var(--primary)]/50 hover:bg-[var(--bgSubtle,var(--surface1))]'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          disabled={disabled}
          className="hidden"
        />
        <div className="w-12 h-12 rounded-xl bg-[var(--primaryMuted,var(--primaryLight))] flex items-center justify-center mb-3">
          <Upload size={22} className="text-[var(--primary)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text)]">
          Drag & drop files here, or <span className="text-[var(--primary)]">browse</span>
        </p>
        <p className="text-xs text-[var(--textTertiary)] mt-1.5">
          Max size: {formatFileSize(maxSizeBytes)}
          {accept && ` | Accepted: ${accept}`}
        </p>
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => {
            const key = file.name + file.size;
            return (
              <li
                key={key}
                className="
                  flex items-center gap-3 p-3 rounded-xl
                  bg-[var(--bgSubtle,var(--surface1))]
                  border border-[var(--borderMuted,var(--border))]/50
                  transition-all duration-200
                  hover:bg-[var(--bgMuted,var(--surface1))]
                "
              >
                {previews[key] ? (
                  <img
                    src={previews[key]}
                    alt={file.name}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[var(--bgOverlay,var(--surface2))] flex items-center justify-center text-[var(--textTertiary)] flex-shrink-0">
                    {getFileIcon(file.type)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{file.name}</p>
                  <p className="text-xs text-[var(--textTertiary)] tabular-nums">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="
                    flex-shrink-0 p-1.5 rounded-lg
                    text-[var(--textTertiary)]
                    hover:text-[var(--error)] hover:bg-[var(--errorMuted,var(--errorLight))]
                    transition-all duration-150
                  "
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="mt-1.5 text-sm text-[var(--error)]">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1.5 text-sm text-[var(--textSecondary)]">{helperText}</p>
      )}
    </div>
  );
}
