/**
 * Registre des tâches planifiées (@Cron) suivies par le monitoring (lot A5).
 * Source unique du libellé, de la fréquence et du seuil d'alerte affichés
 * côté admin — à tenir à jour si une tâche planifiée est ajoutée, renommée
 * ou re-planifiée.
 */

export const JOB_KEYS = {
  LDAP_SYNC: 'ldap-sync',
  SIGNATURE_REMINDERS: 'signature-reminders',
  RESTITUTION_REMINDER: 'restitution-reminder',
  RETENTION: 'retention',
  SMB_RETRY: 'smb-retry',
} as const;

export type JobKey = (typeof JOB_KEYS)[keyof typeof JOB_KEYS];

export interface JobDefinition {
  job: JobKey;
  /** Libellé français affiché côté admin. */
  label: string;
  /** Fréquence en français lisible, affichée côté admin. */
  schedule: string;
  /**
   * Seuil d'alerte "en retard" (en heures) : au-delà de cette durée sans
   * exécution terminée, la tâche est considérée en retard. C'est un passage
   * manqué PLUS une marge, pas un multiple mécanique de l'intervalle nominal
   * — un job planifié uniquement les jours ouvrés ne doit pas déclencher une
   * fausse alerte récurrente à chaque week-end (cf. SIGNATURE_REMINDERS).
   *
   * Cas particulier : LDAP_SYNC est recalculé dynamiquement par
   * MonitoringService à partir de ldap.sync_interval_hours (config admin) —
   * la valeur ci-dessous n'est qu'un repli si cette lecture échoue.
   */
  alertAfterHours: number;
}

export const JOB_REGISTRY: JobDefinition[] = [
  // 2 × l'intervalle nominal (6 h) : un passage manqué + une marge.
  { job: JOB_KEYS.LDAP_SYNC, label: 'Synchronisation LDAP', schedule: 'toutes les 6 h', alertAfterHours: 12 },
  // Vendredi 9 h → lundi 9 h = 72 h (un week-end complet, fonctionnement
  // normal les jours ouvrés) + 2 h de marge = 74 h. Un multiple de
  // l'intervalle nominal (24 h) déclencherait une fausse alerte chaque
  // week-end — voir le correctif du 19/09/2026.
  { job: JOB_KEYS.SIGNATURE_REMINDERS, label: 'Rappels de signature', schedule: 'les jours ouvrés à 9 h', alertAfterHours: 74 },
  // Tâche quotidienne (tous les jours, week-ends inclus) : 2 × 24 h.
  { job: JOB_KEYS.RESTITUTION_REMINDER, label: 'Rappel avant restitution', schedule: 'tous les jours à 9 h', alertAfterHours: 48 },
  // Tâche hebdomadaire : 2 × 7 jours.
  { job: JOB_KEYS.RETENTION, label: 'Rétention RGPD', schedule: 'le dimanche à 3 h', alertAfterHours: 24 * 14 },
  // 2 × l'intervalle nominal (6 h).
  { job: JOB_KEYS.SMB_RETRY, label: 'Relance des exports SMB', schedule: 'toutes les 6 h', alertAfterHours: 12 },
];
