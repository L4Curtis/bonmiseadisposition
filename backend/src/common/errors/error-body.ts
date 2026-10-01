/**
 * Traduction de toute exception en réponse d'erreur unique
 * `{ statusCode, code, message, details? }` (contrat `ApiErrorBody`).
 *
 * Fonction pure, appelée par le filtre global : elle ne journalise rien et ne
 * touche pas à la réponse HTTP, elle dit seulement quoi renvoyer et quoi
 * journaliser.
 *
 * Compatibilité le temps de la vague 3 : un ancien corps d'erreur qui portait
 * ses données à la racine (`{ code: 'serial_conflicts', conflicts }`, sonde
 * de santé…) les garde à la racine, en plus de `details`, jusqu'à ce que son
 * domaine lève une `AppException`.
 */
import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ValidationErrorDetails } from '../../contracts/common';
import {
  defaultCodeForStatus,
  defaultMessageFor,
  isErrorCode,
  isNestDefaultMessage,
  isUnknownRouteMessage,
} from './error-codes';

/** Corps renvoyé : la forme unique (`ApiErrorBody`), plus d'éventuelles clés
 *  héritées à la racine (voir l'en-tête). */
export type ErrorResponseBody = {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: object;
  readonly [legacyKey: string]: unknown;
};

export interface ErrorLog {
  readonly level: 'warn' | 'error';
  readonly text: string;
  readonly stack?: string;
}

export interface ErrorResponse {
  readonly status: number;
  readonly body: ErrorResponseBody;
  /** Ce qu'il faut journaliser côté serveur ; absent pour une erreur HTTP ordinaire. */
  readonly log?: ErrorLog;
}

export interface ErrorRequest {
  readonly method: string;
  readonly url: string;
}

export interface ErrorOptions {
  /** En production, rien d'interne ne sort ; ailleurs, le texte d'une erreur
   *  inattendue va dans `details.debug`. */
  readonly production: boolean;
}

/** Erreurs Prisma connues, traduites en erreur utilisateur. Le détail Prisma
 *  (contrainte, table) n'est jamais renvoyé. */
const PRISMA_ERRORS: Readonly<Record<string, { status: number; code: string; message: string }>> = {
  P2002: { status: HttpStatus.CONFLICT, code: 'already_exists', message: 'Conflit : valeur déjà utilisée' },
  P2003: { status: HttpStatus.BAD_REQUEST, code: 'invalid_reference', message: 'Référence invalide' },
  P2025: { status: HttpStatus.NOT_FOUND, code: 'not_found', message: 'Enregistrement introuvable' },
  P2028: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'service_unavailable',
    message: 'Service temporairement indisponible, réessayez',
  },
};

/** Clés d'un ancien corps Nest qui ne sont pas des données à transmettre. */
const RESERVED_KEYS = new Set(['statusCode', 'error', 'message', 'code', 'details']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorBody(status: number, code: string, message: string, details?: object): ErrorResponseBody {
  return details ? { statusCode: status, code, message, details } : { statusCode: status, code, message };
}

/** Message affichable : celui de l'exception, sauf texte anglais par défaut. */
function displayMessage(message: unknown, code: string, status: number): string {
  const usable =
    typeof message === 'string' &&
    message.trim() !== '' &&
    !isNestDefaultMessage(message) &&
    !isUnknownRouteMessage(message);
  return usable ? message : defaultMessageFor(code, status);
}

function codeFor(status: number, explicitCode: unknown, message: unknown): string {
  if (isErrorCode(explicitCode)) return explicitCode;
  if (status === HttpStatus.NOT_FOUND && typeof message === 'string' && isUnknownRouteMessage(message)) {
    return 'route_not_found';
  }
  return defaultCodeForStatus(status);
}

/** Tableau de messages (validation levée à la main) : chaîne jointe pour
 *  l'affichage, chaque message dans `details.errors`. */
function fromMessageList(status: number, messages: readonly unknown[]): ErrorResponseBody {
  const texts = messages.map(String);
  const details: ValidationErrorDetails = { errors: texts.map((text) => ({ field: null, messages: [text] })) };
  return errorBody(status, 'validation_failed', texts.join(' — '), details);
}

function fromHttpResponse(status: number, response: string | object): ErrorResponseBody {
  if (typeof response === 'string') {
    const code = codeFor(status, undefined, response);
    return errorBody(status, code, displayMessage(response, code, status));
  }
  const source = response as Record<string, unknown>;
  if (Array.isArray(source.message)) return fromMessageList(status, source.message);

  const code = codeFor(status, source.code, source.message);
  const legacy = Object.fromEntries(Object.entries(source).filter(([key]) => !RESERVED_KEYS.has(key)));
  const hasLegacy = Object.keys(legacy).length > 0;
  const explicitDetails = isPlainObject(source.details) ? source.details : undefined;
  const details = explicitDetails || hasLegacy ? { ...legacy, ...explicitDetails } : undefined;
  return { ...errorBody(status, code, displayMessage(source.message, code, status), details), ...legacy };
}

function fromPrisma(error: Prisma.PrismaClientKnownRequestError, request: ErrorRequest): ErrorResponse | undefined {
  const mapped = PRISMA_ERRORS[error.code];
  if (!mapped) return undefined;
  return {
    status: mapped.status,
    body: errorBody(mapped.status, mapped.code, mapped.message),
    log: {
      level: 'warn',
      text: `Prisma ${error.code} traduite en ${mapped.status} sur ${request.method} ${request.url} : ${error.message}`,
    },
  };
}

function fromUnexpected(exception: unknown, request: ErrorRequest, options: ErrorOptions): ErrorResponse {
  const error = exception instanceof Error ? exception : new Error(String(exception));
  const status = HttpStatus.INTERNAL_SERVER_ERROR;
  const details = options.production ? undefined : { debug: error.message };
  return {
    status,
    body: errorBody(status, 'internal_error', defaultMessageFor('internal_error', status), details),
    log: { level: 'error', text: `Erreur inattendue sur ${request.method} ${request.url} : ${error.message}`, stack: error.stack },
  };
}

/** Environnements où le texte d'une erreur inattendue peut être renvoyé.
 *  Liste d'autorisation : un serveur dont NODE_ENV est absent ou mal écrit
 *  est traité comme la production, sans rien d'interne dans la réponse. */
const DEBUG_ENVIRONMENTS = new Set(['development', 'test']);

function defaultErrorOptions(): ErrorOptions {
  return { production: !DEBUG_ENVIRONMENTS.has(process.env.NODE_ENV ?? '') };
}

/** Une erreur HTTP 5xx levée volontairement (base indisponible, sonde de
 *  santé…) est tracée au journal du serveur, sans pile : elle signale un
 *  incident d'exploitation, pas un défaut du code. */
function fromHttpException(exception: HttpException, request: ErrorRequest): ErrorResponse {
  const status = exception.getStatus();
  const body = fromHttpResponse(status, exception.getResponse());
  if (status < HttpStatus.INTERNAL_SERVER_ERROR) return { status, body };
  return { status, body, log: { level: 'warn', text: `Erreur ${status} sur ${request.method} ${request.url} : ${exception.message}` } };
}

export function buildErrorResponse(
  exception: unknown,
  request: ErrorRequest,
  options: ErrorOptions = defaultErrorOptions(),
): ErrorResponse {
  if (exception instanceof HttpException) return fromHttpException(exception, request);
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrisma(exception, request);
    if (mapped) return mapped;
  }
  return fromUnexpected(exception, request, options);
}

/** Corps d'une erreur produite hors de NestJS (middlewares Express). */
export function plainErrorBody(status: number, code: string, message?: string): ErrorResponseBody {
  return errorBody(status, code, message ?? defaultMessageFor(code, status));
}
