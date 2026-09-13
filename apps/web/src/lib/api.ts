/**
 * API client (fetch wrapper) - automatic JWT + refresh + error handling.
 *
 * - Reads `accessToken` from `useAuth` store.
 * - On 401: try refresh once via /auth/refresh, retry, else logout.
 * - Throws ApiError with backend message + code.
 */
'use client';

import { useAuth } from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends RequestInit {
  /** Skip auth header (for /auth/login, /auth/refresh). */
  noAuth?: boolean;
  /** Query params object. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Response type override. Default 'json'. */
  responseType?: 'json' | 'blob' | 'text';
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

export { getApiBaseUrl };

function buildUrl(path: string, query?: ApiOptions['query']): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!query) return `${base}${cleanPath}`;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}${cleanPath}?${qs}` : `${base}${cleanPath}`;
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken?: string };
    useAuth.getState().setTokens(data.accessToken, data.refreshToken ?? '');
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { noAuth, query, responseType = 'json', headers, ...rest } = opts;
  const url = buildUrl(path, query);

  const doFetch = async (token: string | null): Promise<Response> => {
    const h: Record<string, string> = {
      Accept: responseType === 'json' ? 'application/json' : '*/*',
      ...(headers as Record<string, string> | undefined),
    };
    if (!noAuth && token) h['Authorization'] = `Bearer ${token}`;
    if (rest.body && !(rest.body instanceof FormData) && !h['Content-Type']) {
      h['Content-Type'] = 'application/json';
    }
    return fetch(url, { ...rest, headers: h, credentials: 'include' });
  };

  let token = noAuth ? null : useAuth.getState().accessToken;
  let res = await doFetch(token);

  // Auto-refresh on 401
  if (res.status === 401 && !noAuth) {
    if (!refreshPromise) refreshPromise = tryRefresh();
    const newToken = await refreshPromise.finally(() => {
      refreshPromise = null;
    });
    if (newToken) {
      token = newToken;
      res = await doFetch(newToken);
    } else {
      useAuth.getState().logout();
    }
  }

  if (!res.ok) {
    let body: { code?: string; message?: string; details?: unknown; traceId?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.message ?? res.statusText, body.details, body.traceId);
  }

  if (res.status === 204 || responseType === 'text') {
    return (res.text() as unknown) as T;
  }
  if (responseType === 'blob') {
    return (res.blob() as unknown) as T;
  }
  return (await res.json()) as T;
}

// Convenience helpers
export const apiGet = <T>(path: string, query?: ApiOptions['query']) =>
  apiFetch<T>(path, { method: 'GET', query });
export const apiPost = <T>(path: string, body?: unknown, opts: ApiOptions = {}) =>
  apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined, ...opts });
export const apiPatch = <T>(path: string, body?: unknown, opts: ApiOptions = {}) =>
  apiFetch<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined, ...opts });
export const apiDelete = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });
