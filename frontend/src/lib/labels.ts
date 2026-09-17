import type { UserRole } from '@/types';

/** Libellés des rôles (enum backend UserRole). */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  technician: 'Technicien',
  direction: 'Direction',
  collaborator: 'Collaborateur',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

/** Libellés des types de notification (enum backend NotificationType). */
export const NOTIF_TYPE_LABELS: Record<string, string> = {
  mise_dispo_request: 'Demande de signature (mise à dispo)',
  restitution_request: 'Demande de signature (restitution)',
  pv_cloture_request: 'Demande de signature (PV)',
  reminder: 'Rappel',
  restitution_due_reminder: 'Rappel avant restitution prévue',
  confirmation: 'Confirmation',
  contestation_alert: 'Alerte contestation',
  contestation_resolution: 'Résolution contestation',
  cancellation: 'Annulation',
  mark_found: 'Équipement retrouvé',
  unilateral_closure: 'Clôture unilatérale',
};

export function notifTypeLabel(type: string): string {
  return NOTIF_TYPE_LABELS[type] ?? type;
}
