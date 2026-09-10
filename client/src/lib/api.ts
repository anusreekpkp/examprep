import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Empty base URL in dev means requests go to the Vite dev server, which proxies
 * /api to the Express process (see vite.config.ts). In production Render injects
 * VITE_API_BASE_URL at build time.
 */
const rawBaseURL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Render's `fromService.property: host` does not return a hostname despite the
 * name - it returns just the service name, e.g. "examprep-api-t3p8". Prefixing
 * a scheme onto that yields https://examprep-api-t3p8, which fails DNS and
 * surfaces as a response-less network error that looks exactly like the API
 * being down. So a value with no dot is treated as a Render service name.
 */
function normaliseBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    // "localhost" and IP literals are legitimately dotless or numeric.
    const isBareServiceName =
      !url.hostname.includes('.') && url.hostname !== 'localhost' && !/^\d/.test(url.hostname);
    if (isBareServiceName) {
      url.hostname = `${url.hostname}.onrender.com`;
    }
    return url.origin;
  } catch {
    return withScheme;
  }
}

const baseURL = normaliseBaseURL(rawBaseURL);

if (import.meta.env.DEV && rawBaseURL) {
  console.info(`[api] VITE_API_BASE_URL="${rawBaseURL}" resolved to "${baseURL}"`);
}

export const api = axios.create({
  baseURL,
  withCredentials: true,
  // Generous, because a cold Render free instance can take ~50s to answer.
  timeout: 90_000,
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

// ----------------------------------------------------------- cold start ----

/**
 * Render's free tier stops the API after ~15 minutes idle. While it wakes,
 * Render answers with its own holding response, which carries no CORS headers -
 * so the browser blocks it and axios reports a bare network error rather than a
 * status code. Retrying a few times covers the wake-up window instead of
 * showing the student a false "server is down".
 */
const NETWORK_RETRY_DELAYS_MS = [2000, 5000, 10_000, 15_000];

let wakingHandler: ((waking: boolean) => void) | null = null;

export function setServerWakingHandler(handler: ((waking: boolean) => void) | null) {
  wakingHandler = handler;
}

function isColdStartError(error: AxiosError): boolean {
  // No response at all: DNS, connection, timeout, or a CORS-blocked reply.
  if (error.response) return false;
  return error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED';
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RetriableConfig = InternalAxiosRequestConfig & {
  _retried?: boolean;
  _netAttempt?: number;
};

api.interceptors.response.use(
  (response) => {
    // Anything that answers means the instance is up.
    wakingHandler?.(false);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (config && isColdStartError(error)) {
      const attempt = config._netAttempt ?? 0;
      const delay = NETWORK_RETRY_DELAYS_MS[attempt];

      // Out of retries: the API really is unreachable.
      if (delay === undefined) {
        wakingHandler?.(false);
        return Promise.reject(error);
      }

      config._netAttempt = attempt + 1;
      wakingHandler?.(true);
      await wait(delay);
      // Recursing through api.request re-enters this interceptor, so the
      // terminal attempt is what clears the flag and surfaces the failure.
      return api.request(config);
    }

    // A real HTTP status arrived, so the instance is awake even if it said no.
    wakingHandler?.(false);

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
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
      return 'Could not reach the server after several attempts. It may still be starting up - wait a moment and try again.';
    }
  }
  return fallback;
}
