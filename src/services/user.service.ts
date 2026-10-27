import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse, PaginatedResponse } from '@/types/api.types';
import type { UsersDto, UserProfile, CreateStaffRequest } from '@/types/user.types';

export const userService = {
  /**
   * Candidate accounts — everyone holding no staff role. Paginated.
   *
   * `page` is zero-based; `size` defaults to 20 server-side and is capped at
   * 100. Both endpoints became paginated when the underlying query was rewritten
   * — the unbounded version took MySQL out of sort memory.
   */
  getAll(params?: { page?: number; size?: number }) {
    return api.get<PaginatedResponse<UsersDto>>(ENDPOINTS.USERS.GET_ALL, { params });
  },

  /** Staff accounts — admins and super admins, with their roles attached. */
  getStaff(params?: { page?: number; size?: number }) {
    return api.get<PaginatedResponse<UsersDto>>(ENDPOINTS.USERS.GET_STAFF, { params });
  },

  /**
   * One page of the whole roster, filtered server-side.
   *
   * The admin screen reads this rather than merging the two lists above: two
   * independent pagers cannot be stitched into one stable list — a row lands on
   * two pages or on none.
   */
  getDirectory(params: { page?: number; size?: number; role?: string; search?: string }) {
    return api.get<PaginatedResponse<UsersDto>>(ENDPOINTS.USERS.GET_DIRECTORY, { params });
  },

  /**
   * Creates an administrator or super administrator.
   *
   * Server-side this needs the ROLE_MANAGE permission, which only a super
   * admin holds — so an admin calling it gets a 403 rather than being able to
   * mint peers or superiors.
   */
  createStaff(data: CreateStaffRequest) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.USERS.CREATE_STAFF, data);
  },

  getByEmail(email: string) {
    return api.get<UsersDto>(ENDPOINTS.USERS.GET_BY_EMAIL(email));
  },

  update(email: string, data: Partial<UserProfile>) {
    return api.put<ApiResponse<unknown>>(ENDPOINTS.USERS.UPDATE(email), null, {
      params: data,
    });
  },

  activate(email: string) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.USERS.ACTIVATE, null, {
      params: { email },
    });
  },

  deactivate(email: string) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.USERS.DEACTIVATE, null, {
      params: { email },
    });
  },

  uploadProfileImage(email: string, file: File) {
    const formData = new FormData();
    formData.append('profileImage', file);
    return api.put<ApiResponse<unknown>>(ENDPOINTS.USERS.UPDATE(email), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getProfileImage(email: string) {
    return api.get<Blob>(ENDPOINTS.USERS.PROFILE_IMAGE(email), {
      responseType: 'blob',
    });
  },
};
