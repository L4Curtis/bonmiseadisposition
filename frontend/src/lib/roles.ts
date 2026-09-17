import type { UserRole } from '@/types';

/**
 * Rôles « IT » (miroir de backend/src/common/roles.ts). Sert uniquement à
 * l'affichage (liens, boutons, onglets) : les contrôles d'accès réels sont
 * appliqués par le backend.
 */
export const IT_ROLES: readonly UserRole[] = ['admin', 'technician'];

export function isItRole(role: UserRole | string | null | undefined): boolean {
  return !!role && (IT_ROLES as readonly string[]).includes(role);
}
