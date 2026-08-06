import axios from 'axios';
import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type { JobPostDTO } from '@/types/job.types';

/**
 * True when a failure means "this server has no such route" rather than "the
 * request was bad". Lets the edit screen say so plainly instead of showing a
 * bare 404 while the update endpoint is still being built.
 */
export function isEndpointMissing(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 405 || status === 501;
}

export const jobService = {
  getAllJobs() {
    return api.get<JobPostDTO[]>(ENDPOINTS.JOBS.GET_ALL);
  },

  createJob(data: JobPostDTO) {
    return api.post<ApiResponse<JobPostDTO>>(ENDPOINTS.JOBS.CREATE, data);
  },

  /**
   * Edit an existing job post. `jobPrefix` is the key every application and
   * assessment is filed under, so it is sent back unchanged and the backend
   * must reject any attempt to move it.
   *
   * The auto-toast is suppressed so the caller can tell "endpoint not deployed
   * yet" apart from a real validation error — see `isEndpointMissing`.
   */
  updateJob(id: number, data: JobPostDTO) {
    return api.put<ApiResponse<JobPostDTO>>(ENDPOINTS.JOBS.UPDATE(id), data, {
      _skipErrorToast: true,
    } as never);
  },

  /**
   * Remove a job post. Destructive and irreversible — the caller must confirm
   * first, and should warn when candidates have already applied.
   *
   * Toast suppressed for the same reason as `updateJob`.
   */
  deleteJob(id: number) {
    return api.delete<ApiResponse<unknown>>(ENDPOINTS.JOBS.DELETE(id), {
      _skipErrorToast: true,
    } as never);
  },
};
