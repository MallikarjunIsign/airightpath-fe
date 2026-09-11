export interface UsersDto {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  alternativeMobileNumber?: string;
  /** Backend field: whether the account is enabled/active. */
  enabled: boolean;
  /**
   * Active role names, e.g. `['ADMIN']`. Absent, empty and populated are three
   * different facts: absent means this endpoint does not look roles up, empty
   * means the account holds none. `UserRoleBadges` renders each differently.
   */
  roles?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Payload for creating an administrator or super administrator. */
export interface CreateStaffRequest {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  password: string;
  /** USER is rejected server-side — candidates come through registration. */
  role: 'ADMIN' | 'SUPER_ADMIN';
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
