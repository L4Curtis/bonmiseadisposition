/**
 * Lecture des deux formes uniques de l'API (docs/api-conventions.md) :
 *  - l'erreur `{ statusCode, code, message, details? }` ;
 *  - la liste `{ items, total, page, limit, truncated, meta? }`.
 *
 * Le temps de la vague 3, certaines routes répondent encore à l'ancienne
 * forme (message en tableau, données d'erreur à la racine, clé de liste
 * propre à la route, tableau nu) : ces fonctions lisent les deux, pour que
 * chaque écran passe à la nouvelle forme sans attendre les autres.
 */
import type { ListResponse } from '@/contracts';

export interface ParsedApiError {
  /** Identifiant stable de l'erreur (`serial_conflicts`…), `null` s'il n'y en a pas. */
  readonly code: string | null;
  /** Message affichable, `null` si le corps n'en donne pas. */
  readonly message: string | null;
  /** Données de l'erreur (`details`, ou à défaut les données d'un ancien
   *  corps posées à la racine), `null` s'il n'y en a pas. */
  readonly details: Readonly<Record<string, unknown>> | null;
}

const ERROR_RESERVED_KEYS = new Set(['statusCode', 'code', 'message', 'error', 'details']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessage(raw: unknown): string | null {
  if (Array.isArray(raw)) return raw.map(String).join(' — ') || null;
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

function legacyDetails(body: Record<string, unknown>): Record<string, unknown> | null {
  const extras = Object.entries(body).filter(([key]) => !ERROR_RESERVED_KEYS.has(key));
  return extras.length > 0 ? Object.fromEntries(extras) : null;
}

/** Corps d'erreur JSON → code, message et détails (forme unique ou ancienne). */
export function parseErrorBody(body: unknown): ParsedApiError {
  if (!isRecord(body)) return { code: null, message: null, details: null };
  return {
    code: typeof body.code === 'string' && body.code !== '' ? body.code : null,
    message: readMessage(body.message),
    details: isRecord(body.details) ? body.details : legacyDetails(body),
  };
}

export interface ListReadOptions {
  /** Clé de l'ancienne forme de la route (`bons`, `users`, `logs`…), lue si
   *  `items` est absent. */
  readonly legacyKey?: string;
}

const LIST_KEYS = new Set(['items', 'total', 'page', 'limit', 'truncated', 'meta']);

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fromObject<T, M>(body: Record<string, unknown>, items: T[], legacyKey?: string): ListResponse<T, M> {
  const extras = Object.entries(body).filter(([key]) => !LIST_KEYS.has(key) && key !== legacyKey);
  const meta = isRecord(body.meta) ? body.meta : extras.length > 0 ? Object.fromEntries(extras) : undefined;
  return {
    items,
    total: numberOr(body.total, items.length),
    page: numberOr(body.page, 1),
    limit: numberOr(body.limit, items.length),
    truncated: body.truncated === true,
    ...(meta !== undefined ? { meta: meta as M } : {}),
  };
}

/**
 * Réponse de liste → forme unique. Accepte la forme unique, une ancienne
 * liste à clé propre (avec `legacyKey`), `{ items, truncated, total }` et un
 * tableau nu. Toute autre réponse est une erreur : un écran vide en silence
 * a déjà masqué une régression (commit 650508f).
 */
export function toListResponse<T, M = never>(body: unknown, options: ListReadOptions = {}): ListResponse<T, M> {
  if (Array.isArray(body)) return fromObject<T, M>({}, body as T[]);
  if (isRecord(body)) {
    if (Array.isArray(body.items)) return fromObject<T, M>(body, body.items as T[]);
    const legacy = options.legacyKey ? body[options.legacyKey] : undefined;
    if (Array.isArray(legacy)) return fromObject<T, M>(body, legacy as T[], options.legacyKey);
  }
  throw new Error('Réponse inattendue du serveur : une liste était attendue.');
}
