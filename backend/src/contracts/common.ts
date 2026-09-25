/**
 * Contrats de l'API — briques communes.
 *
 * Le dossier `src/contracts/` décrit la forme EXACTE des réponses JSON que
 * l'API renvoie aujourd'hui, telles qu'elles arrivent au navigateur :
 *  - une date (`DateTime` Prisma, y compris `@db.Date`) arrive en chaîne ISO 8601
 *    (`IsoDateTime`) ;
 *  - une colonne facultative en base arrive à `null` (`T | null`) ;
 *  - une clé qui peut être absente du JSON est marquée `clé?: T`.
 *
 * Règles du dossier : uniquement des types (`export interface`, `export type`),
 * aucun code exécutable, aucun import hors de ce dossier (ni Prisma, ni Nest) :
 * le script `scripts/sync-contracts.mjs` le recopie tel quel dans
 * `frontend/src/contracts/`, et la CI vérifie que la copie est à jour.
 *
 * Chaque forme est vérifiée par les tests de contrat HTTP
 * (`test/contract/`), qui interrogent l'application réelle : un changement de
 * réponse sans mise à jour du contrat fait échouer la CI.
 */

/** Date et heure sérialisées par JSON.stringify : « 2026-09-24T08:30:00.000Z ». */
export type IsoDateTime = string;

/** Valeur d'une colonne `Json` (détails d'une entrée du journal d'audit…). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ─── Énumérations de la base (mêmes valeurs que prisma/schema.prisma) ─────────

export type UserRole = 'admin' | 'technician' | 'direction' | 'collaborator';

export type BonStatus =
  | 'draft'
  | 'sent_mise_dispo'
  | 'active'
  | 'sent_restitution'
  | 'partially_returned'
  | 'archived'
  | 'cancelled'
  | 'contested';

export type Civilite = 'mme' | 'mr';

export type EquipmentCategory =
  | 'pc_portable'
  | 'pc_fixe'
  | 'ecran'
  | 'souris'
  | 'clavier'
  | 'casque'
  | 'telephone'
  | 'housse'
  | 'dock'
  | 'cable'
  | 'autre';

export type SignatureType = 'mise_disposition' | 'restitution' | 'it_cachet' | 'pv_cloture';

export type PdfSnapshotType =
  | 'signature_it_mise_disposition'
  | 'signature_collab_mise_disposition'
  | 'signature_it_restitution'
  | 'signature_collab_restitution'
  | 'cloture_equipements_manquants'
  | 'avenant_equipement_retrouve';

export type ContestationStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

export type NotificationType =
  | 'mise_dispo_request'
  | 'restitution_request'
  | 'pv_cloture_request'
  | 'reminder'
  | 'confirmation'
  | 'contestation_alert'
  | 'contestation_resolution'
  | 'cancellation'
  | 'mark_found'
  | 'unilateral_closure'
  | 'restitution_due_reminder';

export type NotificationStatus = 'sent' | 'failed' | 'bounced';

export type SmbExportStatus = 'pending' | 'success' | 'failed';

export type ScheduledJobStatus = 'success' | 'error' | 'skipped';

// ─── Réponses d'erreur ────────────────────────────────────────────────────────

/**
 * Erreur renvoyée par le filtre global (HttpException de NestJS, erreur Prisma
 * connue traduite en 404, 409…) :
 *  - `message` est une chaîne, ou un tableau de chaînes pour une erreur de
 *    validation (ValidationPipe) ;
 *  - `error` (« Bad Request », « Forbidden »…) est absent quand l'exception
 *    est levée sans message (`new UnauthorizedException()`) et pour une erreur
 *    Prisma traduite par le filtre.
 */
export interface NestErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** Refus de la protection CSRF (en-tête X-Requested-With absent) : 403 sans
 *  `statusCode`, produit hors de NestJS par le middleware de main.ts. */
export interface CsrfErrorBody {
  message: string;
}

/** Simple accusé de réception `{ ok: true }` (déconnexion, rafraîchissement…). */
export interface OkResponse {
  ok: true;
}
