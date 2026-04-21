import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { config } from '@/lib/config';

// ── Axios instance ────────────────────────────────────────────────────────────

export const axiosInstance = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Separate bare instance for the refresh call — bypasses the main interceptors
// to prevent infinite 401 retry loops.
const refreshAxios = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
});

// Single in-flight promise so concurrent 401s only trigger one refresh.
let refreshInFlight = null;

async function doRefresh() {
  try {
    const res = await refreshAxios.post('/auth/refresh');
    const { success, data } = res.data ?? {};
    if (success && data?.accessToken) {
      useAuthStore.getState().setAccessToken(data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    refreshInFlight = null;
  }
}

// ── Request interceptor: inject auth token ────────────────────────────────────
// Skips if skipAuth is set or if the caller already supplied an Authorization header.

axiosInstance.interceptors.request.use((cfg) => {
  if (!cfg.skipAuth && !cfg.headers.Authorization) {
    const token = useAuthStore.getState().accessToken;
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

// ── Response interceptor: 401 refresh + error normalisation ──────────────────

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original.skipAuth && !original._isRetry) {
      original._isRetry = true;
      if (!refreshInFlight) refreshInFlight = doRefresh();
      const refreshed = await refreshInFlight;
      if (refreshed) {
        original.headers.Authorization = `Bearer ${useAuthStore.getState().accessToken}`;
        return axiosInstance(original);
      }
      useAuthStore.getState().clear();
      return Promise.reject(new Error('Your session has expired. Please log in again.'));
    }

    const message = error.response?.data?.error ?? error.message ?? 'Request failed';
    const normalised = new Error(message);
    normalised.status = error.response?.status;
    return Promise.reject(normalised);
  },
);
