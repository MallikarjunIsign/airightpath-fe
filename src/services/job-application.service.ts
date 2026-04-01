import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type { JobApplicationDTO } from '@/types/job.types';

export const jobApplicationService = {
  apply(data: FormData) {
    return api.post<ApiResponse<JobApplicationDTO>>(ENDPOINTS.JOB_APPLICATIONS.APPLY, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  update(data: FormData) {
    return api.patch<ApiResponse<JobApplicationDTO>>(ENDPOINTS.JOB_APPLICATIONS.UPDATE, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getByEmail(email: string) {
    return api.get<JobApplicationDTO[]>(ENDPOINTS.JOB_APPLICATIONS.GET_BY_EMAIL(email));
  },

  getByPrefix(prefix: string) {
    return api.get<JobApplicationDTO[]>(ENDPOINTS.JOB_APPLICATIONS.GET_BY_PREFIX(prefix));
  },

  getByPrefixAndEmail(prefix: string, email: string) {
    return api.get<JobApplicationDTO>(ENDPOINTS.JOB_APPLICATIONS.GET_BY_PREFIX_AND_EMAIL(prefix, email));
  },

  filterByPrefix(prefix: string) {
    return api.get<JobApplicationDTO[]>(ENDPOINTS.JOB_APPLICATIONS.FILTER_BY_PREFIX(prefix));
  },

  sendAckMail(data: { emails: string[]; jobPrefix: string; dateTime?: string; content?: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.SEND_ACK_MAIL, data);
  },

  sendRejectionMail(data: { emails: string[]; jobPrefix: string; content?: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.SEND_REJECTION_MAIL, data);
  },

  sendReconfirmationMail(data: { emails: string[]; jobPrefix: string; dateTime?: string; content?: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.SEND_RECONFIRMATION_MAIL, data);
  },

  sendExamLink(data: { emails: string[]; jobPrefix: string; dateTime?: string; content?: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.SEND_EXAM_LINK, data);
  },

  sendSuccessMail(data: { emails: string[]; jobPrefix: string; content?: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.SEND_SUCCESS_MAIL, data);
  },

  sendFailureMail(data: { emails: string[]; jobPrefix: string; content?: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.SEND_FAILURE_MAIL, data);
  },
};
