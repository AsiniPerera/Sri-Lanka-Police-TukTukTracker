import { useSyncExternalStore } from 'react';
import { API_BASE_URL } from './config';

/**
 * Dev-only fallback session backed by the API's own POST /auth/login.
 *
 * This exists so the app is usable while Asgardeo is still being configured, and
 * it mirrors the backend's migration plan: `protect` accepts both Asgardeo RS256
 * tokens and locally-signed HS256 tokens until LEGACY_LOGIN_ENABLED is turned off
 * (see docs/asgardeo-integration.md §3.5).
 *
 * Delete this file and its three call sites once Asgardeo sign-in works.
 */

const STORAGE_KEY = 'tuktuk.legacy.token';

/** Enabled only in `npm run dev`; the production bundle has no password path. */
export const isLegacyLoginAvailable = import.meta.env.DEV;

function read(): string | null {
  if (!isLegacyLoginAvailable) return null;
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Private windows and blocked site data make this throw.
    return null;
  }
}

let token: string | null = read();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getLegacyToken(): string | null {
  return token;
}

function store(next: string | null) {
  token = next;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, next);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal: the token still lives in memory for this page load.
  }
  emit();
}

export function clearLegacySession(): void {
  store(null);
}

/** Re-renders on sign-in/out without a provider wrapping the tree. */
export function useLegacyToken(): string | null {
  return useSyncExternalStore(subscribe, getLegacyToken, () => null);
}

export interface LegacyLoginResult {
  ok: boolean;
  message?: string;
}

/**
 * Calls POST /auth/login directly — no bearer token involved, since this is the
 * endpoint that issues one.
 */
export async function legacyLogin(
  username: string,
  password: string,
): Promise<LegacyLoginResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return {
      ok: false,
      message: `Cannot reach the API at ${API_BASE_URL}. Is it running on port 5000?`,
    };
  }

  const body = (await response.json().catch(() => ({}))) as {
    data?: { token?: string };
    message?: string;
  };

  if (!response.ok || !body.data?.token) {
    return { ok: false, message: body.message ?? `Login failed (${response.status})` };
  }

  store(body.data.token);
  return { ok: true };
}
