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

export function validateImageFile(file: File): string | null {
  if (!isValidImageType(file)) {
    return 'Only JPEG, PNG, and GIF files are allowed.';
  }
  if (!isValidFileSize(file, 5 * 1024 * 1024)) {
    return 'Image size must be less than 5MB.';
  }
  return null;
}
