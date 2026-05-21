import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { useAuthStore } from '@/store/auth.store';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? 'http://10.0.2.2:3000/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshing ??= refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

async function refreshAccessToken(): Promise<string | null> {
  const refresh = useAuthStore.getState().refreshToken;
  if (!refresh) return null;
  try {
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken: refresh });
    useAuthStore.getState().setTokens(data.accessToken, data.refreshToken, data.user);
    return data.accessToken as string;
  } catch {
    useAuthStore.getState().logout();
    return null;
  }
}

export { API_BASE_URL };
