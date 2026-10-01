import { HttpException, HttpStatus } from '@nestjs/common';
import { isErrorCode } from './error-codes';

/**
 * Erreur métier ou technique, renvoyée au navigateur sous la forme unique
 * `{ statusCode, code, message, details? }` (voir docs/api-conventions.md) :
 *
 *   throw new AppException('serial_conflicts', 'Des numéros de série sont déjà prêtés.',
 *     HttpStatus.CONFLICT, { conflicts });
 *
 *  - `code` : identifiant stable en snake_case, que le front teste ;
 *  - `message` : phrase française, affichée telle quelle à l'écran ;
 *  - `status` : statut HTTP (400 par défaut) ;
 *  - `details` : objet de données JSON utiles à l'écran, jamais de secret ni
 *    de détail interne (pile d'appels, requête SQL).
 *
 * Les exceptions de NestJS (`NotFoundException('…')`…) restent permises : le
 * filtre global leur donne le code commun de leur statut. `AppException` sert
 * dès que le front doit reconnaître le cas précis.
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly details?: object;

  constructor(code: string, message: string, status: number = HttpStatus.BAD_REQUEST, details?: object) {
    assertValidError(code, message, status);
    super({ code, message, ...(details ? { details } : {}) }, status);
    this.code = code;
    this.details = details;
  }
}

function assertValidError(code: string, message: string, status: number): void {
  if (!isErrorCode(code)) {
    throw new Error(`Code d'erreur « ${code} » invalide : un identifiant en snake_case est attendu`);
  }
  if (message.trim() === '') {
    throw new Error(`Erreur « ${code} » sans message : le front affiche toujours le message`);
  }
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error(`Statut ${status} invalide pour l'erreur « ${code} » : 4xx ou 5xx attendu`);
  }
}
