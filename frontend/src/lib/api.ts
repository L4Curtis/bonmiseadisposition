const BASE_URL = '/api';

export class ApiError extends Error {
  /** Parsed JSON error body when the server returned one (e.g. { code, sentAt }). */
  body?: unknown;

  constructor(
    public status: number,
    message: string,
    body?: unknown,
  ) {
    super(message);
    this.body = body;
  }
}

const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

/** Build a readable ApiError from a raw error response body: NestJS errors are
 *  JSON ({ statusCode, message, error }) — surface `message` (joined when it is
 *  a class-validator array) instead of the raw JSON string. */
function buildError(status: number, text: string): ApiError {
  try {
    const body: unknown = JSON.parse(text);
    const rawMessage = (body as { message?: unknown })?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(' — ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : text;
    return new ApiError(status, message || `Erreur HTTP ${status}`, body);
  } catch {
    return new ApiError(status, text || `Erreur HTTP ${status}`);
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw buildError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

let refreshPromise: Promise<void> | null = null;

/** Refresh the session once for all concurrent 401s; redirect to login on failure. */
function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: CSRF_HEADER,
    }).then((refreshed) => {
      if (!refreshed.ok) {
        window.location.href = '/login';
        throw new ApiError(401, 'Session expirée');
      }
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function buildInit(options?: RequestInit): RequestInit {
  const { headers, ...rest } = options ?? {};
  return {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...headers },
    credentials: 'include',
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, buildInit(options));

  if (res.status === 401) {
    await refreshSession();
    // Retry original request — same response handling as the nominal path
    const retryRes = await fetch(`${BASE_URL}${path}`, buildInit(options));
    return parseJsonResponse<T>(retryRes);
  }

  return parseJsonResponse<T>(res);
}

/** Envoi multipart (upload de fichier). On NE fixe PAS Content-Type : le
 *  navigateur ajoute la frontière multipart lui-même. */
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const init: RequestInit = { method: 'POST', body: form, headers: CSRF_HEADER, credentials: 'include' };
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (res.status === 401) {
    await refreshSession();
    const retryRes = await fetch(`${BASE_URL}${path}`, init);
    return parseJsonResponse<T>(retryRes);
  }
  return parseJsonResponse<T>(res);
}

async function requestBlob(path: string): Promise<Blob> {
  const init: RequestInit = { headers: CSRF_HEADER, credentials: 'include' };
  const res = await fetch(`${BASE_URL}${path}`, init);

  if (res.status === 401) {
    await refreshSession();
    const retryRes = await fetch(`${BASE_URL}${path}`, init);
    if (!retryRes.ok) throw buildError(retryRes.status, await retryRes.text());
    return retryRes.blob();
  }

  if (!res.ok) throw buildError(res.status, await res.text());
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getBlob: (path: string) => requestBlob(path),
  postForm: <T>(path: string, form: FormData) => requestForm<T>(path, form),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
