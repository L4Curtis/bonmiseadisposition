import { IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

/** Rôles attribuables manuellement depuis Utilisateurs (admin) — mêmes valeurs
 *  que l'enum Prisma `UserRole`. */
const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'technician', 'direction', 'collaborator'];

export class ChangeUserRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  role!: UserRole;
}
