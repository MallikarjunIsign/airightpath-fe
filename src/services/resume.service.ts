import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';

export const resumeService = {
  upload(jobPrefix: string, file: File, config?: Record<string, unknown>) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<unknown>>(ENDPOINTS.RESUME.UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { jobPrefix },
      ...config,
    } as never);
  },

  update(data: FormData, config?: Record<string, unknown>) {
    return api.put<ApiResponse<unknown>>(ENDPOINTS.RESUME.UPDATE, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...config,
    } as never);
  },

  view(email: string, config?: Record<string, unknown>) {
    return api.get<Blob>(ENDPOINTS.RESUME.VIEW(email), {
      responseType: 'blob',
      ...config,
    } as never);
  },

  uploadMultiple(jobPrefix: string, files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api.post<ApiResponse<unknown>>(ENDPOINTS.RESUME.UPLOAD_MULTIPLE, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { jobPrefix },
    });
  },
};
