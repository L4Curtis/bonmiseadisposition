import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Rôles autorisés sur une route (ou sur toutes les routes d'un contrôleur :
 * un `@Roles` posé sur la méthode remplace celui de la classe). Typé sur
 * l'énumération Prisma : une faute de frappe ne compile pas.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Toute personne connectée, quel que soit son rôle : sa propre session, ses
 * propres bons (propriété vérifiée dans la route), la signature par jeton
 * (destinataire vérifié par le service). À écrire `@Roles(...ALL_ROLES)`.
 */
export const ALL_ROLES: readonly UserRole[] = ['admin', 'technician', 'direction', 'collaborator'];
