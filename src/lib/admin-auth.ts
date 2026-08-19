const ADMIN_TOKEN_STORAGE_KEY = 'arbitrage_nexus_admin_token';

type AdminFetchInit = RequestInit & {
  redirectOnAuthFailure?: boolean;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeToken(token: unknown): string {
  return String(token || '').trim();
}

function getCurrentReturnPath(): string {
  if (!isBrowser()) return '/';

  return window.location.pathname + window.location.search + window.location.hash;
}

function redirectToAdminLogin() {
  if (!isBrowser()) return;

  const current = getCurrentReturnPath();

  if (window.location.pathname === '/admin-login') {
    return;
  }

  window.location.href = `/admin-login?next=${encodeURIComponent(current)}`;
}

function emitAdminAuthChanged() {
  if (!isBrowser()) return;

  window.dispatchEvent(
    new CustomEvent('arbitrage-nexus-admin-auth-changed', {
      detail: {
        hasToken: hasAdminToken()
      }
    })
  );
}

export function getAdminToken(): string {
  if (!isBrowser()) return '';

  return normalizeToken(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));
}

export function setAdminToken(token: string) {
  if (!isBrowser()) return;

  const cleanToken = normalizeToken(token);

  if (!cleanToken) {
    clearAdminToken();
    return;
  }

  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, cleanToken);
  emitAdminAuthChanged();
}

export function clearAdminToken() {
  if (!isBrowser()) return;

  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  emitAdminAuthChanged();
}

export function hasAdminToken(): boolean {
  return getAdminToken().length > 0;
}

export function getAdminAuthHeaderValue(): string {
  const token = getAdminToken();

  return token ? `Bearer ${token}` : '';
}

export function adminAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAdminToken();
  const headers = new Headers(extra || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Admin-Api-Token', token);
  }

  return headers;
}

async function parsePossibleJson(response: Response): Promise<any | null> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function isAuthFailureResponse(response: Response, payload: any | null): boolean {
  if (response.status === 401 || response.status === 403) {
    return true;
  }

  return (
    payload &&
    payload.success === false &&
    String(payload.error || '').toUpperCase() === 'AUTH_REQUIRED'
  );
}

export async function adminFetch(
  input: RequestInfo | URL,
  init: AdminFetchInit = {}
): Promise<Response> {
  const { redirectOnAuthFailure = true, ...requestInit } = init;
  const headers = adminAuthHeaders(requestInit.headers);

  const response = await fetch(input, {
    ...requestInit,
    headers
  });

  const payload = await parsePossibleJson(response);

  if (isAuthFailureResponse(response, payload)) {
    const localDevDenial = Boolean(payload?.local_dev_denial);

    if (!localDevDenial) {
      clearAdminToken();
    }

    if (redirectOnAuthFailure) {
      redirectToAdminLogin();
    }
  }

  return response;
}

export async function adminJson<T = any>(
  input: RequestInfo | URL,
  init: AdminFetchInit = {}
): Promise<T> {
  const response = await adminFetch(input, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.message ||
      payload?.error ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}

export async function validateAdminToken(token: string): Promise<boolean> {
  const cleanToken = normalizeToken(token);

  if (!cleanToken) return false;

  try {
    const response = await fetch('/api/system/stats', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'X-Admin-Api-Token': cleanToken
      }
    });

    const payload = await parsePossibleJson(response);

    return response.ok && payload?.success !== false;
  } catch {
    return false;
  }
}

export async function saveAndValidateAdminToken(token: string): Promise<boolean> {
  const cleanToken = normalizeToken(token);

  if (!cleanToken) {
    clearAdminToken();
    return false;
  }

  const valid = await validateAdminToken(cleanToken);

  if (valid) {
    setAdminToken(cleanToken);
  }

  return valid;
}