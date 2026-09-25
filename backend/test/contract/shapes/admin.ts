/** Formes vérifiées des contrats de src/contracts/admin.ts et retention.ts. */
import type {
  AdminStatusJob,
  AdminStatusResponse,
  ConfigHealthResponse,
  ConfigHealthSection,
  ConnectionTestFailure,
  ConnectionTestSuccess,
  FailedNotificationItem,
  FailedNotificationsResponse,
  GeneralConfigValues,
  LdapSyncStatusResponse,
  OkMessageResponse,
  PdfRegenerateMissingResponse,
  RappelsConfigValues,
  SmbFailedExport,
  SmbRetryAllResponse,
  SmbRetryFailure,
  SmbRetrySuccess,
  SmbStatusDisabled,
  SmbStatusEnabled,
  SmtpConfigValues,
  SsoDiagnosticEntry,
} from '../../../src/contracts/admin';
import type {
  RetentionPurgeResponse,
  RetentionRunResult,
  RetentionStatsResponse,
} from '../../../src/contracts/retention';
import { notificationType, scheduledJobStatus, userRole } from '../support/common-shapes';
import { arrayOf, bool, int, isoDate, literal, nullable, num, object, oneOf, optional, str, uuid } from '../support/shape';

export const failedNotifications = object<FailedNotificationsResponse>({
  count: int,
  windowDays: int,
  items: arrayOf(
    object<FailedNotificationItem>({
      id: uuid,
      bonId: uuid,
      reference: str,
      recipient: str,
      type: notificationType,
      sentAt: isoDate,
      error: str,
    }),
    { minLength: 1 },
  ),
});

export const adminStatus = object<AdminStatusResponse>({
  version: str,
  commit: str,
  uptimeSeconds: num,
  database: literal('ok', 'unreachable'),
  jobs: arrayOf(
    object<AdminStatusJob>({
      job: literal('ldap-sync', 'signature-reminders', 'restitution-reminder', 'retention', 'smb-retry'),
      label: str,
      schedule: str,
      lastStartedAt: nullable(isoDate),
      lastFinishedAt: nullable(isoDate),
      lastStatus: nullable(scheduledJobStatus),
      lastError: nullable(str),
      lastDurationMs: nullable(int),
      late: bool,
    }),
    { minLength: 5 },
  ),
});

export const ssoDiagnostic = arrayOf(
  object<SsoDiagnosticEntry>({
    at: isoDate,
    user: str,
    state: literal('presente', 'depassement', 'absente', 'inconnu'),
    groupsCount: int,
    resolvedRole: nullable(userRole),
    message: str,
  }),
);

export const smbStatus = oneOf(
  object<SmbStatusDisabled>({ enabled: literal(false) }),
  object<SmbStatusEnabled>({
    enabled: literal(true),
    total: int,
    success: int,
    failed: int,
    pending: int,
    lastSuccessAt: nullable(isoDate),
  }),
);

export const smbFailedExports = arrayOf(
  object<SmbFailedExport>({
    id: uuid,
    bonId: uuid,
    filename: str,
    errorMessage: nullable(str),
    retryCount: int,
    lastAttemptAt: nullable(isoDate),
    createdAt: isoDate,
    bonReference: str,
  }),
);

export const smbRetryOne = oneOf(
  object<SmbRetrySuccess>({ success: literal(true) }),
  object<SmbRetryFailure>({ success: literal(false), error: str }),
);

export const smbRetryAll = object<SmbRetryAllResponse>({ retried: int, succeeded: int, failed: int });

export const configHealth = object<ConfigHealthResponse>({
  sections: arrayOf(
    object<ConfigHealthSection>({
      key: literal('general', 'entra', 'ldap', 'smtp', 'smb', 'rappels', 'tokens', 'timestamp', 'retention'),
      label: str,
      state: literal('configure', 'incomplet', 'desactive', 'non_configure'),
      detail: str,
      updatedAt: nullable(isoDate),
    }),
    { minLength: 9 },
  ),
});

const configValue = optional(nullable(str));
const maskedSecret = optional(nullable(literal('••••••••')));

export const generalConfig = object<GeneralConfigValues>({ local_auth_enabled: configValue, app_url: configValue });

export const smtpConfig = object<SmtpConfigValues>({
  host: configValue,
  port: configValue,
  secure: configValue,
  user: configValue,
  password: maskedSecret,
  from: configValue,
});

export const rappelsConfig = object<RappelsConfigValues>({
  enabled: configValue,
  delay_1: configValue,
  delay_2: configValue,
  delay_3: configValue,
  restitution_before_days: configValue,
  signature_overdue_days: configValue,
});

export const connectionTest = oneOf(
  object<ConnectionTestSuccess>({ success: literal(true), message: str }),
  object<ConnectionTestFailure>({ success: literal(false), message: str }),
);

export const ldapStatus = object<LdapSyncStatusResponse>({
  lastSync: nullable(isoDate),
  lastSyncSuccess: nullable(bool),
  lastSyncCount: nullable(int),
  lastSyncError: nullable(str),
  lastSyncSkipped: nullable(int),
  lastSyncAborted: bool,
  lastSyncWarning: nullable(str),
});

export const okMessage = object<OkMessageResponse>({ ok: literal(true), message: str });

export const pdfRegenerateMissing = object<PdfRegenerateMissingResponse>({ regenerated: int, failed: int });

// ─── Rétention ────────────────────────────────────────────────────────────────

export const retentionRun = object<RetentionRunResult>({
  eligible: int,
  anonymized: int,
  attachmentsPurged: int,
  oldAttachmentsPurged: int,
  cutoff: isoDate,
  dryRun: bool,
});

export const retentionStats = object<RetentionStatsResponse>({
  enabled: bool,
  config: object<RetentionStatsResponse['config']>({ expiredTokensDays: int, auditLogsYears: int, attachmentMonths: int }),
  purgeable: object<RetentionStatsResponse['purgeable']>({ expiredTokens: int, oldAuditLogs: int, oldAttachments: int }),
  totals: object<RetentionStatsResponse['totals']>({ auditLogs: int, signatures: int }),
});

export const retentionPurge = object<RetentionPurgeResponse>({ ok: literal(true), expiredTokens: int, oldAuditLogs: int });
