import { apiClient } from "./client";
import type { UserDto } from "../types/auth";

export interface CreateUserPayload {
  email: string;
  displayName: string;
  role: string;
  password: string;
}

export interface UpdateUserPayload {
  displayName?: string;
  role?: string;
  isActive?: boolean;
  newPassword?: string;
}

export function fetchUsers(): Promise<UserDto[]> {
  return apiClient.get<UserDto[]>("/api/users");
}

export function createUser(payload: CreateUserPayload): Promise<UserDto> {
  return apiClient.post<UserDto>("/api/users", payload);
}

export function updateUser(id: string, payload: UpdateUserPayload): Promise<UserDto> {
  return apiClient.patch<UserDto>(`/api/users/${id}`, payload);
}
