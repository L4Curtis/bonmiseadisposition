/**
 * Rôles « IT » (accès complet aux bons, à l'administration, aux utilisateurs)
 * par opposition aux rôles en lecture seule (`direction`) ou sans accès
 * back-office (`collaborator`).
 *
 * Historiquement, le contrôle d'accès s'écrivait « tout ce qui n'est pas
 * collaborator est IT » (`user.role !== 'collaborator'`) — un raccourci qui
 * casse dès qu'un rôle non-IT supplémentaire apparaît (`direction`). Toute
 * vérification équivalente doit passer par `isItRole()`.
 */
export const IT_ROLES = ['admin', 'technician'] as const;

export type ItRole = (typeof IT_ROLES)[number];

export function isItRole(role: string): boolean {
  return (IT_ROLES as readonly string[]).includes(role);
}
