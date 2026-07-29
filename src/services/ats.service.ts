import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';

export interface BatchScreenResult {
  fileName?: string;
  candidateName?: string;
  email?: string;
  score: number;
  [key: string]: unknown;
}

export const atsService = {
  /** Screen multiple resumes against a job description (multipart upload). */
  screenBatch(formData: FormData) {
    return api.post<BatchScreenResult[]>(ENDPOINTS.ATS.SCREEN_BATCH, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
