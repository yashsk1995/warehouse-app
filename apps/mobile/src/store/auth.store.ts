import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import type { UserDto } from '@warehouse/types';

interface AuthState {
  user: UserDto | null;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (access: string, refresh: string, user: UserDto) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const KEY = 'warehouse.auth.v1';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  setTokens: async (accessToken, refreshToken, user) => {
    set({ accessToken, refreshToken, user });
    await SecureStore.setItemAsync(KEY, JSON.stringify({ accessToken, refreshToken, user }));
  },
  logout: async () => {
    set({ accessToken: null, refreshToken: null, user: null });
    await SecureStore.deleteItemAsync(KEY);
  },
  hydrate: async () => {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      set({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, user: parsed.user });
    } catch {
      await SecureStore.deleteItemAsync(KEY);
    }
  },
}));

export function useAuthHydration(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    useAuthStore
      .getState()
      .hydrate()
      .finally(() => setReady(true));
  }, []);
  return ready;
}

export const useIsAdmin = () => useAuthStore((s) => s.user?.role === 'ADMIN');
