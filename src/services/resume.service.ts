import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';

export const resumeService = {
  upload(jobPrefix: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<unknown>>(ENDPOINTS.RESUME.UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { jobPrefix },
    });
  },

  update(data: FormData) {
    return api.put<ApiResponse<unknown>>(ENDPOINTS.RESUME.UPDATE, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  view(email: string) {
    return api.get<Blob>(ENDPOINTS.RESUME.VIEW(email), {
      responseType: 'blob',
    });
  },

  viewAll() {
    return api.get(ENDPOINTS.RESUME.VIEW_ALL);
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
