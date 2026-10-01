import { HttpStatus, NotFoundException } from '@nestjs/common';
import { AppException } from '../common/errors';
import type { BonErrorCode, MissingSerialLine, SendSerialConflict } from '../contracts/bons';

/**
 * Erreurs que l'écran d'un bon reconnaît par leur code (`BonErrorCode` du
 * contrat), à la forme unique `{ statusCode, code, message, details }` (voir
 * docs/api-conventions.md § Erreurs). Les données utiles à l'écran (numéros en
 * conflit, lignes sans numéro, date du lien récent) sont dans `details`.
 */

/** Message d'un bon inconnu, aussi rendu pour un brouillon au collaborateur :
 *  rien ne lui révèle qu'un bon se prépare à son nom. */
export const BON_NOT_FOUND_MESSAGE = 'Bon introuvable';

function bonError(code: BonErrorCode, message: string, details: object): AppException {
  return new AppException(code, message, HttpStatus.CONFLICT, details);
}

/** 409 : des numéros de série du bon sont déjà prêtés sur un autre bon en
 *  cours ; renvoyer avec `confirmSerialConflicts` pour passer outre. */
export function serialConflictsError(conflicts: readonly SendSerialConflict[]): AppException {
  const count = conflicts.length;
  const message = count > 1
    ? `${count} numéros de série de ce bon sont déjà prêtés sur un autre bon en cours.`
    : 'Un numéro de série de ce bon est déjà prêté sur un autre bon en cours.';
  return bonError('serial_conflicts', message, { conflicts: conflicts.map((c) => ({ ...c })) });
}

/** 409 : des lignes n'ont ni numéro de série ni numéro d'inventaire ;
 *  renvoyer avec `confirmMissingSerials` pour passer outre. */
export function missingSerialsError(lines: readonly MissingSerialLine[]): AppException {
  const count = lines.length;
  const message = count > 1
    ? `${count} équipements de ce bon n’ont ni numéro de série ni numéro d’inventaire.`
    : 'Un équipement de ce bon n’a ni numéro de série ni numéro d’inventaire.';
  return bonError('missing_serials', message, { lines: lines.map((l) => ({ ...l })) });
}

/** 409 : un lien a été envoyé il y a moins d'une heure ; renvoyer avec
 *  `force` pour confirmer. */
export function tokenRecentError(sentAt: Date): AppException {
  return bonError('token_recent', 'Un lien a été envoyé il y a moins d’une heure.', { sentAt: sentAt.toISOString() });
}

/** 404 d'un bon inconnu (ou d'un brouillon, vu par le collaborateur), code
 *  commun `not_found`. Reste une NotFoundException : les traitements groupés
 *  (relance de plusieurs bons) reconnaissent ainsi un bon disparu. */
export function bonNotFoundError(): NotFoundException {
  return new NotFoundException(BON_NOT_FOUND_MESSAGE);
}

/** Date d'envoi portée par une erreur `token_recent`, `null` pour toute autre erreur. */
export function tokenRecentSentAt(err: unknown): string | null {
  if (!(err instanceof AppException) || err.code !== 'token_recent') return null;
  const sentAt = (err.details as { sentAt?: unknown } | undefined)?.sentAt;
  return typeof sentAt === 'string' ? sentAt : null;
}
