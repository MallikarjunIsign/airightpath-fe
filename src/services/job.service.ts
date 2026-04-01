import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type { JobPostDTO } from '@/types/job.types';

export const jobService = {
  getAllJobs() {
    return api.get<JobPostDTO[]>(ENDPOINTS.JOBS.GET_ALL);
  },

  createJob(data: JobPostDTO) {
    return api.post<ApiResponse<JobPostDTO>>(ENDPOINTS.JOBS.CREATE, data);
  },
};
