/**
 * Codes d'erreur communs et messages français par défaut.
 *
 * Le filtre global (`all-exceptions.filter.ts`) pose l'un de ces codes quand
 * l'erreur n'en porte pas d'autre, et remplace les textes anglais par défaut
 * de NestJS (« Unauthorized », « Forbidden resource »…) par une phrase
 * française : l'écran affiche `message` tel quel.
 */
import type { CommonApiErrorCode } from '../../contracts/common';

/** Un code d'erreur est un identifiant stable en snake_case. */
export const ERROR_CODE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export function isErrorCode(value: unknown): value is string {
  return typeof value === 'string' && ERROR_CODE_PATTERN.test(value);
}

/** Message affiché quand l'erreur n'en donne pas (ou seulement le texte
 *  anglais par défaut de NestJS). */
export const DEFAULT_ERROR_MESSAGES: Readonly<Record<CommonApiErrorCode, string>> = {
  bad_request: 'Requête invalide.',
  validation_failed: 'Les données envoyées sont invalides.',
  invalid_json: 'Le contenu envoyé n’est pas un JSON valide.',
  unauthorized: 'Session absente ou expirée : reconnectez-vous.',
  forbidden: 'Vous n’avez pas les droits nécessaires pour cette action.',
  csrf_rejected:
    'Requête refusée par la protection contre les requêtes d’un autre site (en-tête X-Requested-With absent).',
  not_found: 'Élément introuvable.',
  route_not_found: 'Adresse d’API inconnue.',
  conflict: 'Opération impossible : les données ont changé entre-temps. Rechargez la page.',
  already_exists: 'Conflit : valeur déjà utilisée',
  invalid_reference: 'Référence invalide',
  payload_too_large: 'Contenu trop volumineux.',
  too_many_requests: 'Trop de requêtes, réessayez dans une minute.',
  internal_error: 'Erreur interne du serveur.',
  service_unavailable: 'Service temporairement indisponible, réessayez.',
};

const CODE_BY_STATUS: Readonly<Record<number, CommonApiErrorCode>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'too_many_requests',
  500: 'internal_error',
  503: 'service_unavailable',
};

/** Code commun d'un statut HTTP (repli : `bad_request` pour un 4xx,
 *  `internal_error` pour un 5xx). */
export function defaultCodeForStatus(status: number): CommonApiErrorCode {
  return CODE_BY_STATUS[status] ?? (status < 500 ? 'bad_request' : 'internal_error');
}

/** Message par défaut d'un code commun, sinon celui du statut. Un code métier
 *  porte toujours son propre message (`AppException`). */
export function defaultMessageFor(code: string, status: number): string {
  const common = DEFAULT_ERROR_MESSAGES[code as CommonApiErrorCode];
  return common ?? DEFAULT_ERROR_MESSAGES[defaultCodeForStatus(status)];
}

/** Textes anglais que NestJS et ses modules posent par défaut, dont ceux de
 *  l'envoi de fichiers (multer, via FileInterceptor). */
const NEST_DEFAULT_MESSAGES = new Set([
  'Bad Request',
  'Unauthorized',
  'Forbidden',
  'Forbidden resource',
  'Not Found',
  'Conflict',
  'Payload Too Large',
  'Too Many Requests',
  'ThrottlerException: Too Many Requests',
  'Internal Server Error',
  'Service Unavailable',
  'File too large',
  'Too many files',
  'Too many fields',
  'Too many parts',
  'Unexpected field',
  'Field name too long',
  'Field value too long',
  'Multipart: Boundary not found',
]);

/** « Validation failed (uuid is expected) » : pipes de paramètre de NestJS
 *  (ParseUUIDPipe, ParseIntPipe…). */
const NEST_PIPE_MESSAGE = /^Validation failed \(.+\)$/;

export function isNestDefaultMessage(message: string): boolean {
  return NEST_DEFAULT_MESSAGES.has(message) || NEST_PIPE_MESSAGE.test(message);
}

/** « Cannot GET /api/inconnue » : réponse de NestJS à une route inexistante. */
export function isUnknownRouteMessage(message: string): boolean {
  return /^Cannot [A-Z]+ \//.test(message);
}
