import { useAsgardeo } from '@asgardeo/react';
import { useCallback } from 'react';
import { API_BASE_URL } from '../auth/config';
import { getLegacyToken } from '../auth/legacySession';
import type { ApiEnvelope, ApiErrorBody } from './types';

/** An API error that keeps the backend's machine-readable `error` code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** The officer is authenticated but not provisioned in Mongo (see asgardeoAuth.js). */
  get isNotProvisioned() {
    return this.code === 'USER_NOT_PROVISIONED';
  }

  get isAuthFailure() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialized to JSON automatically. */
  body?: unknown;
  /** Appended as a query string, skipping null/undefined/'' values. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Returns a fetch wrapper that attaches a fresh Asgardeo access token.
 *
 * The token is read from the SDK on every call rather than captured once: the SDK
 * refreshes it in the background, so a token stashed in a module variable goes
 * stale and starts 401ing after the first expiry.
 *
 * Resolves to the full envelope so paginated responses keep their `total`/`pages`.
 */
export function useApi() {
  const { getAccessToken } = useAsgardeo();

  return useCallback(
    async <T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> => {
      const { body, query, headers, ...rest } = options;

      // A dev-only legacy session takes precedence: when one is active the
      // Asgardeo SDK has no token to give, and asking it would just throw.
      let token: string | undefined = getLegacyToken() ?? undefined;
      try {
        if (!token) token = await getAccessToken();
      } catch {
        // No usable token — let the request go out unauthenticated so the API
        // returns its own 401 and the UI shows one consistent error path.
        token = undefined;
      }

      const response = await fetch(buildUrl(path, query), {
        ...rest,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      const text = await response.text();
      const parsed: unknown = text ? JSON.parse(text) : {};

      if (!response.ok) {
        const err = parsed as ApiErrorBody;
        throw new ApiError(
          response.status,
          err?.error ?? 'UNKNOWN',
          err?.message ?? `${response.status} ${response.statusText}`,
        );
      }

      return parsed as ApiEnvelope<T>;
    },
    [getAccessToken],
  );
}

/** Same as useApi() but unwraps to `data`, for calls that ignore pagination meta. */
export function useApiData() {
  const api = useApi();
  return useCallback(
    async <T>(path: string, options?: RequestOptions): Promise<T> => {
      const envelope = await api<T>(path, options);
      return envelope.data;
    },
    [api],
  );
}
