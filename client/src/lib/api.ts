import axios from 'axios';

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

export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
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
