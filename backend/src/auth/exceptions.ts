import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors';

const LOCKED_MESSAGE = 'Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans 30 minutes.';

/**
 * Connexion locale refusée par la protection anti force brute : 401
 * `account_locked`. Le contrôleur la trace en `login_local_locked` (et non
 * `login_local_failed`), pour qu'insister sur un compte verrouillé ne
 * prolonge pas le verrou indéfiniment.
 */
export class AccountLockedException extends AppException {
  constructor(message: string = LOCKED_MESSAGE) {
    super('account_locked', message, HttpStatus.UNAUTHORIZED);
  }
}

/**
 * Création d'un compte SSO en conflit résiduel avec un compte existant
 * (deux connexions simultanées) : 409 `account_conflict`. Le contrôleur
 * renvoie alors vers `/login?error=account_conflict`, distinct de l'échec
 * générique, pour que l'écran propose simplement de réessayer.
 */
export class AccountConflictException extends AppException {
  constructor(message = 'Conflit lors de la création du compte SSO.') {
    super('account_conflict', message, HttpStatus.CONFLICT);
  }
}
