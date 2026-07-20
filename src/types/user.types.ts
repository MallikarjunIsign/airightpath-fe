export interface UsersDto {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  alternativeMobileNumber?: string;
  /** Backend field: whether the account is enabled/active. */
  enabled: boolean;
  roles?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  alternativeMobileNumber?: string;
  address?: string;
  profileImageUrl?: string;
}
