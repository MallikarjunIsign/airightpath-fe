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

/**
 * The prefix the server actually assigned, from a createJob response.
 *
 * Returns null rather than guessing: the share link is handed to candidates, so
 * a prefix we are unsure of would send them to a job that does not exist.
 * Tolerates both a bare entity and an { data: … } envelope.
 */
export function createdJobPrefix(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const direct = (body as JobPostDTO).jobPrefix;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const wrapped = (body as { data?: JobPostDTO }).data?.jobPrefix;
  return typeof wrapped === 'string' && wrapped.trim() ? wrapped : null;
}

export const jobService = {
  getAllJobs() {
    return api.get<JobPostDTO[]>(ENDPOINTS.JOBS.GET_ALL);
  },

  /**
   * Create a job post.
   *
   * The response matters: the server does not store the prefix the admin typed.
   * It upper-cases it and appends the next id (`FE-DEV-2026-005` becomes
   * `FE-DEV-2026-005-1292`), so the created job's real prefix is only knowable
   * from what comes back. Typed as a bare entity because the endpoint returns
   * one, though `createdJobPrefix` reads it defensively.
   */
  createJob(data: JobPostDTO) {
    return api.post<JobPostDTO | ApiResponse<JobPostDTO>>(ENDPOINTS.JOBS.CREATE, data);
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
