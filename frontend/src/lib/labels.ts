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
