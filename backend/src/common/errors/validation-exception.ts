import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ValidationErrorDetail } from '../../contracts/common';
import { AppException } from './app-exception';
import { DEFAULT_ERROR_MESSAGES } from './error-codes';

/** Un détail par champ refusé, sous-objets et tableaux compris
 *  (« lines.1.serialNumber »). */
function flatten(errors: readonly ValidationError[], parentPath: string): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/**
 * Fabrique d'erreur du ValidationPipe global (`exceptionFactory`) : 400
 * `validation_failed`, chaque champ refusé dans `details.errors`, et tous les
 * textes réunis dans `message` pour que l'écran puisse l'afficher directement.
 */
export function validationException(errors: readonly ValidationError[]): AppException {
  const fields = flatten(errors, '');
  const texts = fields.flatMap((field) => field.messages);
  const message = texts.length > 0 ? texts.join(' — ') : DEFAULT_ERROR_MESSAGES.validation_failed;
  return new AppException('validation_failed', message, HttpStatus.BAD_REQUEST, { errors: fields });
}
