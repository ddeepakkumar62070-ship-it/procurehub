import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const baseURL = `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api`;
const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshRequest;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const authEndpoint = /\/auth\/(login|register|refresh|logout)$/.test(
      originalRequest?.url || ''
    );
    if (
      error.response?.status !== 401
      || !originalRequest
      || originalRequest._retry
      || authEndpoint
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      refreshRequest ||= axios.post(
        `${baseURL}/auth/refresh`,
        {},
        { withCredentials: true }
      ).then((response) => {
        const authData = response.data.data;
        useAuthStore.getState().setSession(authData);
        return authData.accessToken;
      }).finally(() => {
        refreshRequest = undefined;
      });

      const accessToken = await refreshRequest;
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      useAuthStore.getState().clearSession();
      return Promise.reject(refreshError);
    }
  }
);

export default api;
