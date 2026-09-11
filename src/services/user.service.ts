import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type { UsersDto, UserProfile, CreateStaffRequest } from '@/types/user.types';

export const userService = {
  /** Candidate accounts. Excludes everyone holding a staff role. */
  getAll() {
    return api.get<UsersDto[]>(ENDPOINTS.USERS.GET_ALL);
  },

  /** Staff accounts — admins and super admins, with their roles attached. */
  getStaff() {
    return api.get<UsersDto[]>(ENDPOINTS.USERS.GET_STAFF);
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
