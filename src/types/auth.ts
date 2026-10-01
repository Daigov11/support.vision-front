export type UserRole = "Admin" | "Support";

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthTokensResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: UserDto;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  lastLoginAt: string | null;
}
