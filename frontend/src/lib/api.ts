import { filenameFromContentDisposition } from './content-disposition';
import { loginPathFor } from './safe-return-to';

/**
 * Client HTTP unique de l'application : toutes les requêtes vers `/api`
 * passent par lui (cookies de session, en-tête anti-CSRF, rafraîchissement de
 * la session expirée, messages d'erreur lisibles).
 */
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

/**
 * Conduite à tenir quand le serveur répond 401 (session absente ou expirée) :
 * - `redirect` (défaut) : rafraîchir la session et rejouer la requête ; si la
 *   session est perdue, aller à la connexion, qui ramènera ensuite ici ;
 * - `no-redirect` : même rafraîchissement, mais en cas d'échec la requête
 *   échoue (ApiError 401) sans quitter la page — pour vérifier la session ;
 * - `no-refresh` : le 401 remonte tel quel, avec le message du serveur — pour
 *   la connexion elle-même, où 401 veut dire « identifiants refusés ».
 */
export type UnauthorizedMode = 'redirect' | 'no-redirect' | 'no-refresh';

export interface RequestOptions {
  /** Annule la requête (page quittée, recherche remplacée par une autre). */
  readonly signal?: AbortSignal;
  /** En-têtes propres à cet appel, ajoutés aux en-têtes communs. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly onUnauthorized?: UnauthorizedMode;
}

/** Fichier reçu du serveur (export CSV, PDF, pièce jointe). */
export interface DownloadedFile {
  readonly blob: Blob;
  /** Nom annoncé par le serveur (`Content-Disposition`), `null` s'il n'en donne pas. */
  readonly filename: string | null;
  /** Le serveur a coupé le fichier à son plafond de lignes (en-tête `X-Truncated`). */
  readonly truncated: boolean;
}

const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' } as const;

/** Build a readable ApiError from a raw error response body: NestJS errors are
 *  JSON ({ statusCode, message, error }) — surface `message` (joined when it is
 *  a class-validator array) instead of the raw JSON string. */
function buildError(status: number, text: string): ApiError {
  if (status === 429) return new ApiError(429, 'Trop de requêtes, réessayez dans une minute.');
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
    // Corps non JSON (page HTML 502 du proxy, texte brut) : ne jamais l'afficher tel quel
    const short = text && !/^\s*</.test(text) && text.length < 200 ? text : '';
    return new ApiError(status, short || `Erreur HTTP ${status}`);
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw buildError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

let refreshPromise: Promise<boolean> | null = null;

/** Rafraîchit la session une seule fois pour tous les 401 simultanés.
 *  Résout `false` si le serveur refuse ; une panne réseau est propagée telle
 *  quelle (elle ne doit pas envoyer vers la connexion). */
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: CSRF_HEADER,
    })
      .then((refreshed) => refreshed.ok)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Envoie vers la connexion en conservant la page courante (retour après). */
function redirectToLogin(): void {
  window.location.href = loginPathFor(window.location.pathname + window.location.search);
}

/**
 * Envoie la requête et applique la politique 401 : rafraîchissement unique
 * de la session, puis rejeu, ou redirection vers la connexion.
 */
async function send(path: string, init: RequestInit, options: RequestOptions): Promise<Response> {
  const mode = options.onUnauthorized ?? 'redirect';
  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), ...options.headers },
      signal: options.signal,
      credentials: 'include',
    });

  const res = await doFetch();
  if (res.status !== 401 || mode === 'no-refresh') return res;

  const refreshed = await refreshSession();
  if (!refreshed) {
    if (mode === 'redirect') redirectToLogin();
    throw new ApiError(401, 'Session expirée');
  }
  return doFetch();
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADER },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

async function request<T>(path: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
  return parseJsonResponse<T>(await send(path, init, options));
}

/** Envoi multipart (upload de fichier). On NE fixe PAS Content-Type : le
 *  navigateur ajoute la frontière multipart lui-même. */
async function requestForm<T>(
  path: string,
  form: FormData,
  method: 'POST' | 'PATCH' | 'PUT',
  options: RequestOptions = {},
): Promise<T> {
  return parseJsonResponse<T>(await send(path, { method, body: form, headers: { ...CSRF_HEADER } }, options));
}

async function requestFile(path: string, options: RequestOptions = {}): Promise<DownloadedFile> {
  const res = await send(path, { headers: { ...CSRF_HEADER } }, options);
  if (!res.ok) throw buildError(res.status, await res.text());
  return {
    blob: await res.blob(),
    filename: filenameFromContentDisposition(res.headers.get('Content-Disposition')),
    truncated: /^(true|1)$/i.test(res.headers.get('X-Truncated') ?? ''),
  };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, jsonInit('GET'), options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, jsonInit('POST', body), options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, jsonInit('PUT', body), options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, jsonInit('PATCH', body), options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, jsonInit('DELETE'), options),
  postForm: <T>(path: string, form: FormData, options?: RequestOptions) =>
    requestForm<T>(path, form, 'POST', options),
  patchForm: <T>(path: string, form: FormData, options?: RequestOptions) =>
    requestForm<T>(path, form, 'PATCH', options),
  /** Fichier du serveur avec son nom et l'indicateur de troncature :
   *  `{ blob, filename, truncated }`. Pour déclencher un téléchargement, passer
   *  par `useDownload`, qui applique aussi le nom et prévient si le fichier
   *  est coupé. */
  getFile: (path: string, options?: RequestOptions) => requestFile(path, options),
  /**
   * @deprecated Utiliser `getFile`. Ne renvoie que le contenu : conservé pour
   * les écrans de `pages/bons/**`, dont un test simule encore la réponse par
   * un simple `Blob`. À retirer quand ils seront passés à `getFile`.
   */
  getBlob: (path: string, options?: RequestOptions) => requestFile(path, options).then((file) => file.blob),
};
