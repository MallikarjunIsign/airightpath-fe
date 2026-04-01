import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type {
  LoginRequest,
  LoginData,
  RegisterRequest,
  MeResponse,
  GenerateOtpRequest,
  ValidateOtpRequest,
  UpdatePasswordRequest,
  ChangePasswordRequest,
  AccessTokenData,
} from '@/types/auth.types';

export const authService = {
  login(data: LoginRequest) {
    return api.post<ApiResponse<LoginData>>(ENDPOINTS.AUTH.LOGIN, data);
  },

  register(data: RegisterRequest) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.AUTH.REGISTER, data);
  },

  refresh() {
    return api.post<ApiResponse<AccessTokenData>>(ENDPOINTS.AUTH.REFRESH);
  },

  logout() {
    return api.post(ENDPOINTS.AUTH.LOGOUT);
  },

  me() {
    return api.get<ApiResponse<MeResponse>>(ENDPOINTS.AUTH.ME);
  },

  generateOtp(data: GenerateOtpRequest) {
    return api.post<ApiResponse<{ message: string }>>(ENDPOINTS.AUTH.GENERATE_OTP, data);
  },

  validateOtp(data: ValidateOtpRequest) {
    return api.post<ApiResponse<{ message: string }>>(ENDPOINTS.AUTH.VALIDATE_OTP, data);
  },

  updatePassword(data: UpdatePasswordRequest) {
    return api.put<ApiResponse<{ message: string }>>(ENDPOINTS.AUTH.UPDATE_PASSWORD, null, {
      params: data,
    });
  },

  changePassword(data: ChangePasswordRequest) {
    return api.put<ApiResponse<{ message: string }>>(ENDPOINTS.AUTH.CHANGE_PASSWORD, null, {
      params: data,
    });
  },
};
