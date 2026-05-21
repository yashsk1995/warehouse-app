import { api } from './api';
import type { AuthTokensDto } from '@warehouse/types';

export async function login(username: string, password: string): Promise<AuthTokensDto> {
  const { data } = await api.post<AuthTokensDto>('/auth/login', { username, password });
  return data;
}

export async function logoutApi(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
}
