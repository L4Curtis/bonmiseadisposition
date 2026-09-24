/**
 * Les quatre durées de la rétention RGPD (catégorie de configuration
 * `retention`), décrites pour le parcours de première configuration (lot H4).
 *
 * Les valeurs de départ proposées sont celles que le serveur applique déjà
 * quand rien n'est enregistré (retention.service.ts) : enregistrer puis activer
 * sans rien changer ne réserve donc aucune surprise. Les minimums reprennent
 * ceux du serveur (admin.controller.ts, INTEGER_CONFIG_RULES) — le plancher de
 * 60 mois de l'anonymisation y est imposé, ici on l'explique avant l'envoi. Le
 * maximum de 600 mois est celui au-delà duquel le serveur plafonne la durée
 * (retention.service.ts, getMonths) ; les autres maximums sont de simples
 * garde-fous de saisie.
 */

export type RetentionDurationKey = 'anonymize_months' | 'attachment_months' | 'expired_tokens_days' | 'audit_logs_years';

export interface RetentionDurationDef {
  key: RetentionDurationKey;
  label: string;
  unit: 'mois' | 'jours' | 'années';
  /** Ce que fait la durée une fois écoulée. */
  effect: string;
  /** Sur quelles données elle agit. */
  data: string;
  /** Valeur de départ proposée. */
  suggested: number;
  /** Pourquoi cette valeur de départ. */
  rationale: string;
  min: number;
  max: number;
}

/** Plancher légal de l'anonymisation (miroir de ANONYMIZE_MONTHS_FLOOR côté serveur). */
export const ANONYMIZE_MONTHS_FLOOR = 60;

export const RETENTION_DURATIONS: readonly RetentionDurationDef[] = [
  {
    key: 'anonymize_months',
    label: 'Anonymisation des bons',
    unit: 'mois',
    effect:
      "Efface les données personnelles du bon (nom, email, signatures, adresses IP) et détruit ses preuves " +
      '(PDF signés, archives probantes, pièces jointes). Irréversible.',
    data:
      'Bons clôturés ou annulés dont la dernière modification dépasse cette durée. La référence, les dates, ' +
      'la filiale et les modèles d’équipement sont conservés comme statistique anonyme.',
    suggested: ANONYMIZE_MONTHS_FLOOR,
    rationale:
      'Plancher légal : 60 mois (5 ans). Aucune valeur inférieure n’est acceptée — le serveur la refuse et, ' +
      'par sécurité, relève toute valeur plus basse à 60 mois.',
    min: ANONYMIZE_MONTHS_FLOOR,
    max: 600,
  },
  {
    key: 'attachment_months',
    label: 'Purge des pièces jointes',
    unit: 'mois',
    effect: 'Supprime les pièces jointes (fichiers et lignes) sans toucher au reste du bon.',
    data:
      'Pièces jointes des bons clôturés ou annulés dont la dernière modification dépasse cette durée, ' +
      'qu’ils soient déjà anonymisés ou non. Les PDF signés ne sont pas concernés.',
    suggested: 24,
    rationale:
      'Valeur appliquée aujourd’hui par le serveur quand rien n’est enregistré. Les pièces jointes sont des ' +
      'documents complémentaires, pas les preuves de remise : elles peuvent partir avant l’anonymisation.',
    min: 1,
    max: 600,
  },
  {
    key: 'expired_tokens_days',
    label: 'Purge des liens de signature expirés',
    unit: 'jours',
    effect: 'Supprime les demandes de signature jamais signées dont le lien a expiré.',
    data:
      'Lignes de signature non signées dont le lien a expiré depuis plus de cette durée. ' +
      'Aucune signature effectuée n’est concernée.',
    suggested: 30,
    rationale:
      'Valeur par défaut du serveur : un mois laisse le temps de comprendre un lien expiré signalé par un ' +
      'collaborateur avant que la trace technique disparaisse.',
    min: 1,
    max: 3650,
  },
  {
    key: 'audit_logs_years',
    label: 'Purge du journal d’audit',
    unit: 'années',
    effect: 'Supprime les lignes du journal d’audit plus anciennes que cette durée.',
    data:
      'Toutes les lignes du journal d’audit, y compris celles d’un bon encore conservé (prêt de longue durée). ' +
      'Allongez la durée si le référent souhaite garder l’historique complet de ces bons.',
    suggested: 5,
    rationale:
      'Valeur par défaut du serveur, alignée sur la durée légale de conservation des bons.',
    min: 1,
    max: 100,
  },
];

export type RetentionDurationValues = Record<RetentionDurationKey, string>;

/** Valeurs du formulaire : celles déjà enregistrées, sinon les valeurs de départ. */
export function initialDurationValues(saved: Record<string, string | undefined>): RetentionDurationValues {
  return Object.fromEntries(
    RETENTION_DURATIONS.map((d) => [d.key, saved[d.key] || String(d.suggested)]),
  ) as RetentionDurationValues;
}

/** Message d'erreur d'une durée saisie, ou null si elle est valide. */
export function durationError(def: RetentionDurationDef, raw: string): string | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return 'Saisissez un nombre entier.';
  const n = Number(value);
  if (def.key === 'anonymize_months' && n < ANONYMIZE_MONTHS_FLOOR) {
    return `Minimum légal : ${ANONYMIZE_MONTHS_FLOOR} mois.`;
  }
  if (n < def.min) return `Minimum : ${def.min} ${def.unit}.`;
  if (n > def.max) return `Maximum : ${def.max} ${def.unit}.`;
  return null;
}
