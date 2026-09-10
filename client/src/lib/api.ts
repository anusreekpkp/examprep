import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Empty base URL in dev means requests go to the Vite dev server, which proxies
 * /api to the Express process (see vite.config.ts). In production Render injects
 * VITE_API_BASE_URL at build time.
 */
const rawBaseURL = import.meta.env.VITE_API_BASE_URL ?? '';

// Render's `fromService.property: host` yields a bare hostname with no scheme,
// which axios would treat as a relative path. Normalise it to an absolute URL.
const baseURL =
  rawBaseURL && !/^https?:\/\//i.test(rawBaseURL) ? `https://${rawBaseURL}` : rawBaseURL;

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------- token ----

/**
 * The access token is held in memory only. localStorage would survive a reload
 * but is readable by any injected script; the httpOnly refresh cookie restores
 * the session instead, which is the safer trade.
 */
let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setAuthLostHandler(handler: (() => void) | null) {
  onAuthLost = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// -------------------------------------------------------------- refresh ----

interface RefreshResponse {
  success: boolean;
  data: { user: AuthUser; accessToken: string };
}

/**
 * Shared across concurrent 401s so a page that fires five requests at once
 * triggers one refresh, not five — five would rotate the token five times and
 * trip the server's reuse detection.
 */
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= api
    .post<RefreshResponse>('/api/auth/refresh')
    .then((response) => {
      const token = response.data.data.accessToken;
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    const isRefreshCall = config?.url?.includes('/api/auth/refresh');
    if (status !== 401 || !config || config._retried || isRefreshCall) {
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      const token = await refreshAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
      return await api.request(config);
    } catch (refreshError) {
      setAccessToken(null);
      onAuthLost?.();
      return Promise.reject(refreshError);
    }
  },
);

// ---------------------------------------------------------------- types ----

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface HealthResponse {
  success: boolean;
  status: string;
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/api/health');
  return data;
}

/** Pulls the readable message out of our error envelope instead of "Request failed". */
export function extractErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as
      | { message?: string; details?: { field: string; message: string }[] }
      | undefined;
    if (payload?.details?.length) {
      return payload.details.map((d) => d.message).join('. ');
    }
    if (payload?.message) return payload.message;
    if (error.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the API running?';
  }
  return fallback;
}
