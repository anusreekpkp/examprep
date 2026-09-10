import { create } from 'zustand';
import {
  api,
  refreshAccessToken,
  setAccessToken,
  setAuthLostHandler,
  type AuthUser,
} from '@/lib/api';

interface AuthResponse {
  success: boolean;
  data: { user: AuthUser; accessToken: string };
}

interface AuthState {
  user: AuthUser | null;
  /** True until the silent-refresh attempt on boot settles, so routes can wait. */
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,

  login: async (email, password) => {
    const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
    setAccessToken(data.data.accessToken);
    set({ user: data.data.user });
  },

  register: async (input) => {
    const { data } = await api.post<AuthResponse>('/api/auth/register', input);
    setAccessToken(data.data.accessToken);
    set({ user: data.data.user });
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setAccessToken(null);
      set({ user: null });
    }
  },

  /**
   * On a page reload the access token is gone but the refresh cookie survives,
   * so one silent refresh restores the session without a login screen flash.
   */
  bootstrap: async () => {
    try {
      await refreshAccessToken();
      const { data } = await api.get<{ success: boolean; data: { user: AuthUser } }>(
        '/api/auth/me',
      );
      set({ user: data.data.user });
    } catch {
      setAccessToken(null);
      set({ user: null });
    } finally {
      set({ isBootstrapping: false });
    }
  },
}));

// If a refresh fails mid-session the interceptor calls this, dropping the user
// back to a signed-out state so ProtectedRoute redirects.
setAuthLostHandler(() => {
  useAuthStore.setState({ user: null });
});
