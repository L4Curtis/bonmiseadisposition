/**
 * Erreur unique de l'API : `AppException` pour lever une erreur que le front
 * reconnaît par son `code`, le filtre global et ses aides. Voir
 * docs/api-conventions.md § Erreurs.
 */
export { AppException } from './app-exception';
export { AllExceptionsFilter } from './all-exceptions.filter';
export { DEFAULT_ERROR_MESSAGES, defaultCodeForStatus, isErrorCode } from './error-codes';
export { buildErrorResponse } from './error-body';
export { bodyParserErrorHandler, sendError } from './express-errors';
export { validationException } from './validation-exception';
