/**
 * Contrats de l'API — administration : supervision (état des tâches planifiées,
 * emails en échec, diagnostic SSO), export SMB, configuration par rubrique,
 * tests de connexion, synchronisation LDAP et régénération des PDF manquants.
 *
 * Contrôleurs : `admin/admin.controller.ts` (préfixe `/api/admin`) et
 * `pdf/pdf-admin.controller.ts` (préfixe `/api/admin/pdf`). Toutes ces routes
 * sont réservées à l'administrateur.
 */

import type { IsoDateTime, NotificationType, OkResponse, ScheduledJobStatus, UserRole } from './common';

// ─── Emails en échec ──────────────────────────────────────────────────────────

/** Email en échec sur la fenêtre demandée (100 au plus, les plus récents d'abord). */
export interface FailedNotificationItem {
  /** Identifiant de la ligne du journal des notifications. */
  id: string;
  /** Bon concerné (relation obligatoire en base : jamais `null` en pratique). */
  bonId: string;
  /** Référence du bon, « — » si le bon est introuvable. */
  reference: string;
  /** Adresse du destinataire. */
  recipient: string;
  type: NotificationType;
  sentAt: IsoDateTime;
  /** Message d'erreur du serveur SMTP, chaîne vide s'il n'a pas été enregistré. */
  error: string;
}

/**
 * GET /api/admin/notifications/failed?days= — emails en échec des `days`
 * derniers jours (défaut 30, borné entre 1 et 365 ; une valeur illisible
 * reprend le défaut). Réservé à l'administrateur.
 */
export interface FailedNotificationsResponse {
  /** Nombre total d'échecs sur la fenêtre (peut dépasser la longueur de `items`). */
  count: number;
  /** Fenêtre réellement appliquée, en jours. */
  windowDays: number;
  items: FailedNotificationItem[];
}

// ─── État de l'application et des tâches planifiées ──────────────────────────

/** Identifiant d'une tâche planifiée suivie (monitoring/job-registry.ts). */
export type ScheduledJobKey =
  | 'ldap-sync'
  | 'signature-reminders'
  | 'restitution-reminder'
  | 'retention'
  | 'smb-retry';

/** Dernier passage d'une tâche planifiée. Les champs de passage sont `null`
 *  tant que la tâche n'a jamais tourné. */
export interface AdminStatusJob {
  job: ScheduledJobKey;
  /** Libellé français (« Synchronisation LDAP »…). */
  label: string;
  /** Fréquence en français (« toutes les 6 h »…). */
  schedule: string;
  lastStartedAt: IsoDateTime | null;
  lastFinishedAt: IsoDateTime | null;
  lastStatus: ScheduledJobStatus | null;
  lastError: string | null;
  lastDurationMs: number | null;
  /** Vrai quand la tâche n'a pas terminé de passage depuis son seuil d'alerte
   *  (jamais vrai pour une dernière exécution en erreur). */
  late: boolean;
}

/**
 * GET /api/admin/status — version et commit déployés, disponibilité de la
 * base et dernier passage de chaque tâche planifiée (toujours les cinq tâches
 * du registre, dans l'ordre du registre). Réservé à l'administrateur.
 */
export interface AdminStatusResponse {
  /** Variable APP_VERSION, « dev » à défaut. */
  version: string;
  /** Variable APP_COMMIT, « dev » à défaut. */
  commit: string;
  uptimeSeconds: number;
  database: 'ok' | 'unreachable';
  jobs: AdminStatusJob[];
}

// ─── Diagnostic SSO ───────────────────────────────────────────────────────────

/** Ce que le jeton d'identité Entra contenait au sujet des groupes. */
export type SsoGroupsClaimState = 'presente' | 'depassement' | 'absente';

/** Une connexion SSO et le rôle qui en a résulté (lu dans le journal d'audit). */
export interface SsoDiagnosticEntry {
  at: IsoDateTime;
  /** Nom affiché, sinon adresse email, sinon « Inconnu ». */
  user: string;
  /** « inconnu » quand l'entrée du journal ne porte pas d'état lisible. */
  state: SsoGroupsClaimState | 'inconnu';
  /** Nombre de groupes reçus (0 si la revendication est absente). */
  groupsCount: number;
  /** Rôle attribué, `null` quand le rôle existant a été conservé faute de groupes. */
  resolvedRole: UserRole | null;
  /** Explication en français, chaîne vide si absente du journal. */
  message: string;
}

/**
 * GET /api/admin/sso/diagnostic?limit= — dernières connexions SSO, les plus
 * récentes d'abord (10 par défaut, borné entre 1 et 50). Réservé à
 * l'administrateur.
 */
export type SsoDiagnosticResponse = SsoDiagnosticEntry[];

// ─── Export SMB ───────────────────────────────────────────────────────────────

/** Export SMB désactivé (`smb.enabled` différent de « true ») : aucun compteur. */
export interface SmbStatusDisabled {
  enabled: false;
}

/** Export SMB actif : compteurs de tous les exports enregistrés. */
export interface SmbStatusEnabled {
  enabled: true;
  total: number;
  success: number;
  failed: number;
  pending: number;
  /** Dernier export réussi, `null` s'il n'y en a jamais eu. */
  lastSuccessAt: IsoDateTime | null;
}

/** GET /api/admin/smb/status — deux formes selon que l'export SMB est actif ou non. */
export type SmbStatusResponse = SmbStatusDisabled | SmbStatusEnabled;

/** Export SMB en échec. */
export interface SmbFailedExport {
  id: string;
  bonId: string;
  filename: string;
  errorMessage: string | null;
  retryCount: number;
  lastAttemptAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  bonReference: string;
}

/**
 * GET /api/admin/smb/failed — les 100 exports en échec les plus récents ;
 * tableau vide quand l'export SMB est désactivé.
 */
export type SmbFailedExportsResponse = SmbFailedExport[];

/** Relance réussie (ou export déjà réussi auparavant). */
export interface SmbRetrySuccess {
  success: true;
}

/** Relance en échec : export introuvable, snapshot PDF introuvable, chemin
 *  invalide ou partage non monté, erreur d'écriture. */
export interface SmbRetryFailure {
  success: false;
  error: string;
}

/**
 * POST /api/admin/smb/retry/:id — relance d'un export. Répond 201 dans les
 * deux branches (y compris « Export introuvable ») ; seul l'export SMB
 * désactivé produit une erreur 400.
 */
export type SmbRetryOneResponse = SmbRetrySuccess | SmbRetryFailure;

/**
 * POST /api/admin/smb/retry-all — relance des exports en échec ayant moins de
 * 3 tentatives (50 au plus). Erreur 400 si l'export SMB est désactivé.
 */
export interface SmbRetryAllResponse {
  retried: number;
  succeeded: number;
  failed: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** Rubriques de configuration acceptées par `/api/admin/config/:category`. */
export type ConfigCategory =
  | 'general'
  | 'entra'
  | 'ldap'
  | 'smtp'
  | 'smb'
  | 'rappels'
  | 'tokens'
  | 'timestamp'
  | 'retention';

export type ConfigHealthState = 'configure' | 'incomplet' | 'desactive' | 'non_configure';

/** État calculé d'une rubrique, sans aucun secret. */
export interface ConfigHealthSection {
  key: ConfigCategory;
  /** Libellé français de la rubrique (« Active Directory »…). */
  label: string;
  state: ConfigHealthState;
  /** Phrase d'explication destinée à l'administrateur. */
  detail: string;
  /** Dernière modification d'une clé de la rubrique, `null` si aucune clé enregistrée. */
  updatedAt: IsoDateTime | null;
}

/**
 * GET /api/admin/config/health — état de chaque rubrique. Toujours neuf
 * sections, dans l'ordre : general, ldap, entra, smtp, rappels, tokens, smb,
 * timestamp, retention. Réservé à l'administrateur.
 */
export interface ConfigHealthResponse {
  sections: ConfigHealthSection[];
}

/**
 * Valeur renvoyée à la place d'un secret enregistré (huit puces U+2022) :
 * le secret déchiffré n'est jamais renvoyé.
 */
export type MaskedSecret = '••••••••';

/*
 * Valeurs d'une rubrique, telles que renvoyées par GET /api/admin/config/:category.
 * Règles communes :
 *  - seules les clés enregistrées en base figurent dans la réponse (une clé
 *    jamais enregistrée est absente, d'où `clé?:`) ;
 *  - toute valeur est une chaîne (« true » / « false » pour un interrupteur,
 *    un entier écrit en chaîne pour une durée), ou `null` si la colonne est vide ;
 *  - une clé chiffrée (secret) renvoie `MaskedSecret` dès qu'une valeur est
 *    enregistrée, `null` sinon.
 */

/** Rubrique `general`. */
export interface GeneralConfigValues {
  local_auth_enabled?: string | null;
  /** Pour l'administrateur, pré-remplie avec la variable FRONTEND_URL quand
   *  elle n'est pas enregistrée en base (et que FRONTEND_URL est définie). */
  app_url?: string | null;
}

/** Rubrique `entra`. */
export interface EntraConfigValues {
  tenant_id?: string | null;
  client_id?: string | null;
  client_secret?: MaskedSecret | null;
  redirect_uri?: string | null;
  admin_group_id?: string | null;
  technician_group_id?: string | null;
  direction_group_id?: string | null;
}

/** Rubrique `ldap`. */
export interface LdapConfigValues {
  url?: string | null;
  search_base?: string | null;
  bind_dn?: string | null;
  bind_password?: MaskedSecret | null;
  user_filter?: string | null;
  enabled?: string | null;
  sync_interval_hours?: string | null;
  use_ssl?: string | null;
}

/** Rubrique `smtp`. */
export interface SmtpConfigValues {
  host?: string | null;
  port?: string | null;
  secure?: string | null;
  user?: string | null;
  password?: MaskedSecret | null;
  from?: string | null;
}

/** Rubrique `smb`. */
export interface SmbConfigValues {
  enabled?: string | null;
  path?: string | null;
  username?: string | null;
  password?: MaskedSecret | null;
  domain?: string | null;
}

/** Rubrique `rappels`. */
export interface RappelsConfigValues {
  enabled?: string | null;
  delay_1?: string | null;
  delay_2?: string | null;
  delay_3?: string | null;
  restitution_before_days?: string | null;
  signature_overdue_days?: string | null;
}

/** Rubrique `tokens`. */
export interface TokensConfigValues {
  expiry_days?: string | null;
}

/** Rubrique `timestamp`. */
export interface TimestampConfigValues {
  enabled?: string | null;
  tsa_url?: string | null;
}

/** Rubrique `retention`. */
export interface RetentionConfigValues {
  enabled?: string | null;
  anonymize_months?: string | null;
  attachment_months?: string | null;
  expired_tokens_days?: string | null;
  audit_logs_years?: string | null;
}

/** Valeurs renvoyées, rubrique par rubrique. */
export interface ConfigValuesByCategory {
  general: GeneralConfigValues;
  entra: EntraConfigValues;
  ldap: LdapConfigValues;
  smtp: SmtpConfigValues;
  smb: SmbConfigValues;
  rappels: RappelsConfigValues;
  tokens: TokensConfigValues;
  timestamp: TimestampConfigValues;
  retention: RetentionConfigValues;
}

/**
 * GET /api/admin/config/:category — dictionnaire des valeurs enregistrées de
 * la rubrique (voir les règles ci-dessus). Réservé à l'administrateur ; une
 * rubrique inconnue répond 400. Une clé retirée de la liste autorisée mais
 * restée en base serait elle aussi renvoyée.
 */
export type ConfigSectionResponse<C extends ConfigCategory = ConfigCategory> = ConfigValuesByCategory[C];

/**
 * PUT /api/admin/config/:category — enregistrement des valeurs envoyées
 * (chaînes uniquement, clés autorisées de la rubrique ; un secret envoyé vide
 * est ignoré). Réservé à l'administrateur.
 */
export type ConfigUpdateResponse = OkResponse;

// ─── Tests de connexion ───────────────────────────────────────────────────────

export interface ConnectionTestSuccess {
  success: true;
  message: string;
}

/** Échec du test : le message explique la cause (configuration incomplète,
 *  serveur injoignable, identifiants refusés…). */
export interface ConnectionTestFailure {
  success: false;
  message: string;
}

/**
 * POST /api/admin/config/test/ldap, POST /api/admin/config/test/smtp,
 * POST /api/admin/config/test/entra, POST /api/admin/config/test/smb — test
 * de connexion avec la configuration enregistrée. Répond 201 dans les deux
 * branches, l'échec étant porté par `success: false` et `message`. Seul le
 * test SMTP peut répondre 400, quand `testEmail` est fourni et invalide.
 * Réservé à l'administrateur.
 */
export type ConnectionTestResponse = ConnectionTestSuccess | ConnectionTestFailure;

// ─── Synchronisation LDAP ─────────────────────────────────────────────────────

/**
 * GET /api/admin/ldap/status — résultat de la dernière synchronisation LDAP.
 * État tenu en mémoire par l'instance du backend : tout est `null` (et
 * `lastSyncAborted` faux) après un redémarrage, tant qu'aucune synchronisation
 * n'a abouti. Réservé à l'administrateur.
 */
export interface LdapSyncStatusResponse {
  lastSync: IsoDateTime | null;
  lastSyncSuccess: boolean | null;
  /** Comptes lus dans l'annuaire, `null` après un échec. */
  lastSyncCount: number | null;
  /** Message d'échec traduit, ou message du garde-fou de désactivation massive. */
  lastSyncError: string | null;
  /** Comptes ignorés (collision d'email ou d'identifiant), `null` après un échec. */
  lastSyncSkipped: number | null;
  /** Vrai quand la phase de désactivation a été annulée par le garde-fou. */
  lastSyncAborted: boolean;
  /** Message du garde-fou quand `lastSyncAborted` est vrai, sinon `null`. */
  lastSyncWarning: string | null;
}

/** Accusé de réception accompagné d'un message à afficher. */
export interface OkMessageResponse extends OkResponse {
  message: string;
}

/**
 * POST /api/admin/ldap/sync — synchronisation lancée en arrière-plan ; la
 * réponse n'attend pas son résultat (à lire ensuite sur /admin/ldap/status).
 * Réservé à l'administrateur.
 */
export type LdapSyncTriggerResponse = OkMessageResponse;

/**
 * DELETE /api/admin/ldap/users — désactivation (jamais la suppression) des
 * comptes collaborateurs issus de LDAP. Le nombre de comptes désactivés n'est
 * disponible que dans `message` (« N utilisateur(s) LDAP désactivé(s) »).
 * Réservé à l'administrateur.
 */
export type LdapUsersDeactivateResponse = OkMessageResponse;

// ─── PDF de preuve ────────────────────────────────────────────────────────────

/**
 * POST /api/admin/pdf/regenerate-missing — régénération des PDF de preuve
 * manquants pour les signatures déjà recueillies. Réservé à l'administrateur.
 */
export interface PdfRegenerateMissingResponse {
  regenerated: number;
  failed: number;
}
