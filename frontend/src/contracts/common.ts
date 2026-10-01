// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/common.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

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
 * Règles du dossier : des types (`export interface`, `export type`), aucun
 * import hors de ce dossier (ni Prisma, ni Nest) : le script
 * `scripts/sync-contracts.mjs` le recopie tel quel dans `frontend/src/contracts/`,
 * et la CI vérifie que la copie est à jour. Seule exception, les CATALOGUES
 * partagés par les deux côtés (`audit-actions.ts`) : des données constantes
 * et des fonctions pures, sans aucun import, pour que le serveur et l'écran
 * affichent exactement les mêmes libellés.
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
  | 'avenant_equipement_retrouve'
  | 'remise_sans_signature'
  | 'cloture_sans_signature';

/** Motif d'invalidation d'un lien de signature (colonne `Signature.invalidatedReason`). */
export type SignatureInvalidationReason =
  | 'replaced'
  | 'in_person'
  | 'modified'
  | 'return_corrected'
  | 'cancelled'
  | 'contested'
  | 'handover_without_signature'
  | 'closed_without_signature'
  | 'account_deactivated';

export type ContestationStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

/** Issue d'une contestation tranchée : « Fondée » / « Non retenue ». */
export type ContestationOutcome = 'founded' | 'not_retained';

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
  | 'restitution_due_reminder'
  | 'handover_without_signature'
  | 'contestation_overdue_alert'
  | 'link_request_alert';

export type NotificationStatus = 'sent' | 'failed' | 'bounced' | 'skipped';

export type SmbExportStatus = 'pending' | 'success' | 'failed';

export type ScheduledJobStatus = 'success' | 'error' | 'skipped';

// ─── Erreur unique ────────────────────────────────────────────────────────────

/**
 * Codes d'erreur communs à toutes les routes, posés par le filtre global
 * (`backend/src/common/errors/`) quand l'erreur n'en porte pas d'autre. Un
 * domaine déclare ses propres codes dans son contrat (`BonErrorCode`…) :
 * `code` reste donc une chaîne, stable, en `snake_case`.
 */
export type CommonApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'invalid_json'
  | 'unauthorized'
  | 'forbidden'
  | 'csrf_rejected'
  | 'not_found'
  | 'route_not_found'
  | 'conflict'
  | 'already_exists'
  | 'invalid_reference'
  | 'payload_too_large'
  | 'too_many_requests'
  | 'internal_error'
  | 'service_unavailable';

/** Contenu libre de `details` : un objet JSON. */
export interface ApiErrorDetails {
  [key: string]: JsonValue;
}

/**
 * Forme UNIQUE de toute réponse d'erreur de l'API (4xx et 5xx), quel que soit
 * l'endroit qui la produit (service, garde, validation, protection CSRF,
 * lecture du corps JSON, base de données) :
 *  - `statusCode` répète le code HTTP ;
 *  - `code` est un identifiant stable, à tester par le front plutôt que le
 *    texte ;
 *  - `message` est TOUJOURS une chaîne française affichable telle quelle ;
 *  - `details` porte les données utiles à l'écran (champs refusés, numéros
 *    en conflit…), selon le `code`.
 */
export interface ApiErrorBody<C extends string = string, D extends object = ApiErrorDetails> {
  statusCode: number;
  code: C;
  message: string;
  details?: D;
}

/** Un champ refusé par la validation des données reçues. `field` est le chemin
 *  du champ (« equipments.0.serialNumber »), `null` s'il est inconnu. */
export interface ValidationErrorDetail {
  field: string | null;
  messages: string[];
}

/** `details` d'une erreur `validation_failed` (400). `message` réunit les
 *  mêmes textes, séparés par « — », pour un affichage direct. */
export interface ValidationErrorDetails {
  errors: ValidationErrorDetail[];
}

export type ValidationErrorBody = ApiErrorBody<'validation_failed', ValidationErrorDetails>;

// ─── Listes ───────────────────────────────────────────────────────────────────

/** Tailles de page acceptées par les listes paginées (`limit`). Une autre
 *  valeur est refusée en 400, jamais corrigée en silence. */
export type PageSize = 25 | 50 | 100;

/**
 * Forme UNIQUE d'une liste, paginée ou complète (petits référentiels compris) :
 *  - `items` : les éléments de la page ;
 *  - `total` : nombre d'éléments correspondant aux filtres, toutes pages
 *    confondues ;
 *  - `page` (à partir de 1) et `limit` : la page servie ; une liste complète
 *    répond `page: 1` et `limit` = `total` ;
 *  - `truncated` : la liste a été coupée à un plafond (export, recherche) ;
 *  - `meta` : données annexes propres à la route (`openCount`,
 *    `exportLimit`…), absentes quand la route n'en a pas.
 */
export interface ListResponse<T, M = never> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  truncated: boolean;
  meta?: M;
}

/** Simple accusé de réception `{ ok: true }` (déconnexion, rafraîchissement…). */
export interface OkResponse {
  ok: true;
}
