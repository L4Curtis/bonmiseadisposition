import { IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

/** Rôles attribuables depuis l'écran Utilisateurs : toutes les valeurs de
 *  l'enum Prisma `UserRole`. */
const ASSIGNABLE_ROLES: UserRole[] = Object.values(UserRole);

export class ChangeUserRoleDto {
  @IsIn(ASSIGNABLE_ROLES, { message: `Rôle inconnu : valeurs admises ${ASSIGNABLE_ROLES.join(', ')}` })
  role!: UserRole;
}
