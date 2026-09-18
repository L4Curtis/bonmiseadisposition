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
/** Comparaison tolérante : un identifiant de groupe collé depuis le portail
 *  Entra arrive souvent avec une espace, un retour à la ligne ou une casse
 *  différente de celle du jeton. Une comparaison stricte échouait alors
 *  silencieusement et l'utilisateur gardait son rôle précédent. */
function normalise(valeur: string): string {
  return valeur.trim().toLowerCase();
}

function appartient(groups: string[], groupId: string | null | undefined): boolean {
  if (!groupId || !groupId.trim()) return false;
  const attendu = normalise(groupId);
  return groups.some((g) => typeof g === 'string' && normalise(g) === attendu);
}

export function resolveRoleFromGroups(groups: string[], config: RoleGroupsConfig): ResolvedRole {
  if (appartient(groups, config.adminGroupId)) {
    return { role: 'admin', isItStaff: true };
  }
  if (appartient(groups, config.technicianGroupId)) {
    return { role: 'technician', isItStaff: true };
  }
  if (appartient(groups, config.directionGroupId)) {
    return { role: 'direction', isItStaff: false };
  }
  return { role: 'collaborator', isItStaff: false };
}
