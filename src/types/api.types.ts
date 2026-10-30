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
  // Declared on the public config too, so a caller can pass `_skipErrorToast`
  // straight to api.get/post without casting. The interceptor reads it off the
  // internal config, which extends this one.
  export interface AxiosRequestConfig {
    _skipErrorToast?: boolean;
    /**
     * Set by the startup check of "am I signed in?". A visitor who is not gets a 401 there, which is the answer
     * and not a session that just died, so no "session expired" notice and no forced logout.
     */
    _silentAuth?: boolean;
  }
  export interface InternalAxiosRequestConfig {
    _skipErrorToast?: boolean;
    _silentAuth?: boolean;
  }
}

export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
