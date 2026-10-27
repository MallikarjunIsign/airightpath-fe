import { APP_CONFIG } from '@/config/app.config';

export function isValidResumeType(file: File): boolean {
  return APP_CONFIG.SUPPORTED_RESUME_TYPES.includes(file.type);
}

export function isValidImageType(file: File): boolean {
  return APP_CONFIG.SUPPORTED_IMAGE_TYPES.includes(file.type);
}

export function isValidFileSize(file: File, maxBytes = APP_CONFIG.MAX_FILE_SIZE_BYTES): boolean {
  return file.size <= maxBytes;
}

export function validateResumeFile(file: File): string | null {
  if (!isValidResumeType(file)) {
    return 'Only PDF, DOC, and DOCX files are allowed.';
  }
  if (!isValidFileSize(file)) {
    return `File size must be less than ${APP_CONFIG.MAX_FILE_SIZE_MB}MB.`;
  }
  return null;
}

/** Filename from a `Content-Disposition` header, or null when absent. */
export function filenameFromContentDisposition(header?: string): string | null {
  if (!header) return null;
  // RFC 5987 form first (filename*=UTF-8''name.pdf), then the plain one.
  const encoded = /filename\*=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return encoded[1];
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? null;
}

/** Best-guess extension for a resume blob whose name the server didn't send. */
export function resumeExtensionForType(mimeType?: string): string {
  if (mimeType?.includes('wordprocessingml')) return '.docx';
  if (mimeType?.includes('msword')) return '.doc';
  return '.pdf';
}

export function validateImageFile(file: File): string | null {
  if (!isValidImageType(file)) {
    return 'Only JPEG, PNG, and GIF files are allowed.';
  }
  if (!isValidFileSize(file, 5 * 1024 * 1024)) {
    return 'Image size must be less than 5MB.';
  }
  return null;
}
