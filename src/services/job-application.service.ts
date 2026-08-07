import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type { JobApplicationDTO, ScreeningRun } from '@/types/job.types';

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

  /**
   * @deprecated Screens the whole job as a side effect of a GET. Use `screen()`.
   */
  filterByPrefix(prefix: string) {
    return api.get<JobApplicationDTO[]>(ENDPOINTS.JOB_APPLICATIONS.FILTER_BY_PREFIX(prefix));
  },

  /**
   * Runs ATS screening and returns a per-candidate report.
   *
   * Pass `emails` to screen only those candidates — everyone else on the job
   * keeps their status. Omit it (or pass an empty list) to screen the whole
   * job. Results come back in the order the emails were sent.
   *
   * Rows come back with `screened: false` when they were scored but not saved
   * (already past shortlisting, never ATS-screened, or a finalised rejection);
   * `reason` says which, in words meant to be shown to the admin as-is.
   */
  screen(data: { jobPrefix: string; emails?: string[] }) {
    return api.post<ScreeningRun>(ENDPOINTS.JOB_APPLICATIONS.SCREEN, data);
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

  /**
   * Manually shortlist candidates, skipping ATS.
   *
   * `override: true` reopens a REJECTED application — the backend treats
   * REJECTED as terminal otherwise, so "Shortlist Anyway" fails on exactly the
   * case it exists for without it. The override also clears the rejection
   * status server-side, so the candidate can be screened again afterwards.
   * It applies only to REJECTED; SELECTED and mid-pipeline still throw.
   */
  shortlist(data: { jobPrefix: string; emails: string[]; override?: boolean }) {
    return api.patch<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.SHORTLIST, data);
  },

  /** Admin sets a candidate's referral status. Sent as query params (no body). */
  setReferralStatus(data: {
    jobPrefix: string;
    email: string;
    referralStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  }) {
    return api.patch<ApiResponse<unknown>>(ENDPOINTS.JOB_APPLICATIONS.REFERRAL_STATUS, null, {
      params: data,
    });
  },
};
