import type { ListResponse } from '@/contracts';
import { filenameFromContentDisposition } from './content-disposition';
import { loginPathFor } from './safe-return-to';
import { parseErrorBody, toListResponse } from './api-envelope';
import type { ListReadOptions } from './api-envelope';

/**
 * Client HTTP unique de l'application : toutes les requêtes vers `/api`
 * passent par lui (cookies de session, en-tête anti-CSRF, rafraîchissement de
 * la session expirée, messages d'erreur lisibles, listes à la forme unique).
 */
const BASE_URL = '/api';

/**
 * Erreur renvoyée par l'API. Le serveur répond `{ statusCode, code, message,
 * details? }` : un écran teste `code` (identifiant stable), affiche `message`
 * et lit ses données dans `details` (ex. `details.conflicts`).
 */
export class ApiError extends Error {
  /** Corps JSON brut de l'erreur, quand le serveur en a renvoyé un. */
  body?: unknown;
  /** Identifiant stable de l'erreur (`serial_conflicts`…), `null` s'il n'y en a pas. */
  readonly code: string | null;
  /** Données de l'erreur, `null` s'il n'y en a pas. */
  readonly details: Readonly<Record<string, unknown>> | null;

  constructor(
    public status: number,
    message: string,
    body?: unknown,
  ) {
    super(message);
    this.body = body;
    const parsed = parseErrorBody(body);
    this.code = parsed.code;
    this.details = parsed.details;
  }
}

/** Vrai si `e` est une erreur de l'API portant ce code. */
export function hasErrorCode(e: unknown, code: string): e is ApiError {
  return e instanceof ApiError && e.code === code;
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

/** ApiError lisible à partir du corps d'une réponse en erreur : le `message`
 *  de l'erreur unique (ou, pour une ancienne réponse, son tableau de messages
 *  joint), jamais le JSON brut. */
function buildError(status: number, text: string): ApiError {
  if (status === 429) return new ApiError(429, 'Trop de requêtes, réessayez dans une minute.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Corps non JSON (page HTML 502 du proxy, texte brut d'un intermédiaire,
    // souvent en anglais) : jamais affiché tel quel, phrase française selon
    // le statut.
    return new ApiError(status, fallbackMessage(status));
  }
  return new ApiError(status, parseErrorBody(body).message ?? fallbackMessage(status), body);
}

/** Message d'une erreur dont le corps ne donne aucun texte affichable. */
function fallbackMessage(status: number): string {
  if (status === 413) return 'Contenu trop volumineux.';
  if (status === 502 || status === 503 || status === 504) {
    return 'Serveur momentanément indisponible, réessayez dans quelques instants.';
  }
  return `Erreur HTTP ${status}`;
}

/** Message d'une réponse réussie dont le corps n'est pas du JSON (page HTML
 *  servie à la place de l'API par un intermédiaire mal réglé…). */
export const UNEXPECTED_RESPONSE_MESSAGE = 'Réponse inattendue du serveur. Rechargez la page puis réessayez.';

/** Message d'une requête qui n'a pas pu joindre le serveur. */
export const NETWORK_ERROR_MESSAGE = 'Serveur injoignable : vérifiez votre connexion puis réessayez.';

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw buildError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, UNEXPECTED_RESPONSE_MESSAGE);
  }
}

/** Requête envoyée ; une panne réseau (fetch rejeté, hors annulation) devient
 *  une ApiError de statut 0 au message français, au lieu du « Failed to
 *  fetch » du navigateur. Une annulation (AbortError) suit son cours. */
async function fetchOrNetworkError(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
}

let refreshPromise: Promise<boolean> | null = null;

/** Rafraîchit la session une seule fois pour tous les 401 simultanés.
 *  Résout `false` si le serveur refuse ; une panne réseau est propagée telle
 *  quelle (elle ne doit pas envoyer vers la connexion). */
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetchOrNetworkError(`${BASE_URL}/auth/refresh`, {
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
    fetchOrNetworkError(`${BASE_URL}${path}`, {
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

/** Options d'une lecture de liste : celles d'une requête, plus la clé de
 *  l'ancienne forme de la route le temps de la vague 3. */
export type ListRequestOptions = RequestOptions & ListReadOptions;

async function requestList<T, M>(path: string, options: ListRequestOptions = {}): Promise<ListResponse<T, M>> {
  const body = await request<unknown>(path, jsonInit('GET'), options);
  return toListResponse<T, M>(body, { legacyKey: options.legacyKey });
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, jsonInit('GET'), options),
  /** Liste à la forme unique `{ items, total, page, limit, truncated, meta? }`.
   *  Lit aussi l'ancienne forme d'une route (`legacyKey`, tableau nu). */
  getList: <T, M = never>(path: string, options?: ListRequestOptions) => requestList<T, M>(path, options),
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
