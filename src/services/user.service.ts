import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type { UsersDto, UserProfile } from '@/types/user.types';

export const userService = {
  getAll() {
    return api.get<UsersDto[]>(ENDPOINTS.USERS.GET_ALL);
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
