import { UserRole } from '@prisma/client';

/** Identifiants des groupes Entra ID configurés (admin/technicien/direction) —
 *  `null`/`undefined` quand le groupe correspondant n'est pas configuré. */
export interface RoleGroupsConfig {
  adminGroupId: string | null | undefined;
  technicianGroupId: string | null | undefined;
  directionGroupId: string | null | undefined;
}

export interface ResolvedRole {
  role: UserRole;
  isItStaff: boolean;
}

/**
 * Détermine le rôle applicatif à partir des groupes Entra présents dans le
 * token SSO — priorité admin > technician > direction > collaborator, aucun
 * groupe élevé ne matche → collaborator. `direction` n'est jamais du
 * personnel IT (`isItStaff: false`).
 *
 * Fonction pure extraite de AuthService.syncUserRoleFromGroups : les groupes
 * font TOUJOURS foi, sans exception — aucune lecture du rôle existant en
 * base, le résultat ne dépend que des groupes actuellement présents.
 */
export function resolveRoleFromGroups(groups: string[], config: RoleGroupsConfig): ResolvedRole {
  if (config.adminGroupId && groups.includes(config.adminGroupId)) {
    return { role: 'admin', isItStaff: true };
  }
  if (config.technicianGroupId && groups.includes(config.technicianGroupId)) {
    return { role: 'technician', isItStaff: true };
  }
  if (config.directionGroupId && groups.includes(config.directionGroupId)) {
    return { role: 'direction', isItStaff: false };
  }
  return { role: 'collaborator', isItStaff: false };
}
