export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp?: string;
}

export interface ApiError {
  code: string;
  message: string;
  path?: string;
  details?: Record<string, unknown> | null;
}

export interface ApiErrorEnvelope {
  success: false;
  code: string;
  message: string;
  path?: string;
  details?: Record<string, unknown> | null;
  timestamp?: string;
}

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _skipErrorToast?: boolean;
  }
}

export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
