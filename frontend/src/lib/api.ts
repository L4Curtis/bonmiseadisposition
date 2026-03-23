const BASE_URL = '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...options?.headers },
    credentials: 'include',
    ...options,
  });

  if (res.status === 401) {
    // Try to refresh token
    const refreshed = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: CSRF_HEADER,
    });
    if (refreshed.ok) {
      // Retry original request
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...options?.headers },
        credentials: 'include',
        ...options,
      });
      if (!retryRes.ok) throw new ApiError(retryRes.status, await retryRes.text());
      return retryRes.json();
    } else {
      // Refresh failed — redirect to login
      window.location.href = '/login';
      throw new ApiError(401, 'Session expired');
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
