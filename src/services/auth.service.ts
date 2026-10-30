import api from "./api.service";
import { ENDPOINTS } from "@/config/api.endpoints";
import type { ApiResponse } from "@/types/api.types";
import type {
  LoginRequest,
  LoginData,
  RegisterRequest,
  MeResponse,
  GenerateOtpRequest,
  ValidateOtpRequest,
  UpdatePasswordRequest,
  ChangePasswordRequest,
} from "@/types/auth.types";

export const authService = {
  login(data: LoginRequest) {
    return api.post<ApiResponse<LoginData>>(ENDPOINTS.AUTH.LOGIN, data);
  },

  register(data: RegisterRequest) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.AUTH.REGISTER, data);
  },

  logout() {
    return api.post(ENDPOINTS.AUTH.LOGOUT);
  },

  me() {
    // The startup probe of "is there a signed-in session?". Silent on a 401: for a visitor that is the answer.
    return api.get<ApiResponse<MeResponse>>(ENDPOINTS.AUTH.ME, {
      _skipErrorToast: true,
      _silentAuth: true,
    });
  },

  generateOtp(data: GenerateOtpRequest) {
    return api.post<ApiResponse<{ message: string }>>(
      ENDPOINTS.AUTH.GENERATE_OTP,
      data,
    );
  },

  validateOtp(data: ValidateOtpRequest) {
    return api.post<ApiResponse<{ message: string }>>(
      ENDPOINTS.AUTH.VALIDATE_OTP,
      data,
    );
  },

  updatePassword(data: UpdatePasswordRequest) {
    return api.put<ApiResponse<{ message: string }>>(
      ENDPOINTS.AUTH.UPDATE_PASSWORD,
      null,
      {
        params: data,
      },
    );
  },

  changePassword(data: ChangePasswordRequest) {
    return api.put<ApiResponse<{ message: string }>>(
      ENDPOINTS.AUTH.CHANGE_PASSWORD,
      null,
      {
        params: data,
      },
    );
  },
};
