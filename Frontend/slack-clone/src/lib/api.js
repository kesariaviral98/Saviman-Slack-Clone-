// ─────────────────────────────────────────────────────────────────────────────
// API client — thin fetch wrapper around the Saviman REST API.
//
// Features:
//   • Adds Authorization: Bearer {token} from authStore automatically
//   • 401 → attempts silent token refresh (single in-flight refresh)
//   • Retries the original request once after a successful refresh
//   • Unwraps { success, data, error } envelope — throws on success=false
//   • All paths are relative (works via Vite dev proxy + Nginx in prod)
// ─────────────────────────────────────────────────────────────────────────────

import { useAuthStore } from '@/stores/authStore';
import { config } from '@/lib/config';

// A single promise shared across concurrent 401 failures so we only hit
// /auth/refresh once even if multiple requests fail simultaneously.
let refreshInFlight = null;

async function doRefresh() {
  try {
    const res = await fetch(`${config.apiUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    const json = await res.json();
    if (json.success && json.data?.accessToken) {
      useAuthStore.getState().setAccessToken(json.data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    refreshInFlight = null;
  }
}

async function refreshAccessToken() {
  if (!refreshInFlight) refreshInFlight = doRefresh();
  return refreshInFlight;
}

// ── Core request ──────────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    skipAuth = false,
    _isRetry = false,
  } = options;

  const accessToken = useAuthStore.getState().accessToken;

  const headers = {
    'Content-Type': 'application/json',
    ...(accessToken && !skipAuth ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers ?? {}),
  };

  const fetchOptions = {
    method,
    headers,
    credentials: 'include',
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  };

  let res;
  try {
    res = await fetch(`${config.apiUrl}${path}`, fetchOptions);
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  // ── Transparent token refresh ──────────────────────────────────────────────
  if (res.status === 401 && !skipAuth && !_isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { ...options, _isRetry: true });
    }
    // Cookie expired — clear session and surface a clean error
    useAuthStore.getState().clear();
    throw new Error('Your session has expired. Please log in again.');
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server returned non-JSON response (status ${res.status})`);
  }

  if (!json.success) {
    const err = new Error(json.error ?? 'Request failed');
    err.status = res.status;
    throw err;
  }

  return json.data;
}

// ── Public helpers ────────────────────────────────────────────────────────────

export const api = {
  get:    (path, options)       => request(path, { ...options, method: 'GET' }),
  post:   (path, body, options) => request(path, { ...options, method: 'POST',  body }),
  put:    (path, body, options) => request(path, { ...options, method: 'PUT',   body }),
  patch:  (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options)       => request(path, { ...options, method: 'DELETE' }),
};
