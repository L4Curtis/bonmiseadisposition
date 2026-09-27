/**
 * Formes communes à plusieurs domaines : énumérations de la base et réponses
 * d'erreur. Chaque énumération est construite à partir d'un dictionnaire
 * `Record<Union, true>` : oublier ou inventer une valeur ne compile pas.
 */
import type {
  BonStatus,
  Civilite,
  ContestationOutcome,
  ContestationStatus,
  CsrfErrorBody,
  EquipmentCategory,
  NestErrorBody,
  NotificationStatus,
  NotificationType,
  OkResponse,
  PdfSnapshotType,
  ScheduledJobStatus,
  SignatureInvalidationReason,
  SignatureType,
  SmbExportStatus,
  UserRole,
} from '../../../src/contracts/common';
import { arrayOf, int, literal, object, oneOf, optional, Shape, str } from './shape';

/** Énumération complète : une entrée par valeur de l'union, ni plus ni moins. */
export function enumOf<V extends string>(values: Record<V, true>): Shape<V> {
  return literal(...(Object.keys(values) as V[]));
}

export const userRole = enumOf<UserRole>({ admin: true, technician: true, direction: true, collaborator: true });

export const bonStatus = enumOf<BonStatus>({
  draft: true,
  sent_mise_dispo: true,
  active: true,
  sent_restitution: true,
  partially_returned: true,
  archived: true,
  cancelled: true,
  contested: true,
});

export const civilite = enumOf<Civilite>({ mme: true, mr: true });

export const equipmentCategory = enumOf<EquipmentCategory>({
  pc_portable: true,
  pc_fixe: true,
  ecran: true,
  souris: true,
  clavier: true,
  casque: true,
  telephone: true,
  housse: true,
  dock: true,
  cable: true,
  autre: true,
});

export const signatureType = enumOf<SignatureType>({
  mise_disposition: true,
  restitution: true,
  it_cachet: true,
  pv_cloture: true,
});

export const pdfSnapshotType = enumOf<PdfSnapshotType>({
  signature_it_mise_disposition: true,
  signature_collab_mise_disposition: true,
  signature_it_restitution: true,
  signature_collab_restitution: true,
  cloture_equipements_manquants: true,
  avenant_equipement_retrouve: true,
  remise_sans_signature: true,
  cloture_sans_signature: true,
});

export const signatureInvalidationReason = enumOf<SignatureInvalidationReason>({
  replaced: true,
  in_person: true,
  modified: true,
  cancelled: true,
  contested: true,
  handover_without_signature: true,
  closed_without_signature: true,
  account_deactivated: true,
});

export const contestationStatus = enumOf<ContestationStatus>({
  open: true,
  in_review: true,
  resolved: true,
  rejected: true,
});

export const contestationOutcome = enumOf<ContestationOutcome>({ founded: true, not_retained: true });

export const notificationType = enumOf<NotificationType>({
  mise_dispo_request: true,
  restitution_request: true,
  pv_cloture_request: true,
  reminder: true,
  confirmation: true,
  contestation_alert: true,
  contestation_resolution: true,
  cancellation: true,
  mark_found: true,
  unilateral_closure: true,
  restitution_due_reminder: true,
  handover_without_signature: true,
  contestation_overdue_alert: true,
  link_request_alert: true,
});

export const notificationStatus = enumOf<NotificationStatus>({ sent: true, failed: true, bounced: true, skipped: true });

export const smbExportStatus = enumOf<SmbExportStatus>({ pending: true, success: true, failed: true });

export const scheduledJobStatus = enumOf<ScheduledJobStatus>({ success: true, error: true, skipped: true });

// ─── Erreurs ──────────────────────────────────────────────────────────────────

export const nestError = object<NestErrorBody>({
  statusCode: int,
  message: oneOf(str, arrayOf(str)),
  error: optional(str),
});

export const csrfError = object<CsrfErrorBody>({ message: str });

export const ok = object<OkResponse>({ ok: literal(true) });
