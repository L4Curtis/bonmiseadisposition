// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/bons.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — bons (`backend/src/bons/bons.controller.ts`).
 *
 * Deux projections d'un bon coexistent :
 *  - `BonDetail` : select canonique `BON_SELECT_SHAPE` (common/types.ts), renvoyé
 *    par la fiche et par toutes les actions du cycle de vie ;
 *  - `BonListItem` : projection allégée `BON_LIST_SELECT`
 *    (bons/queries/bon-list-select.ts), renvoyée par la liste paginée.
 * Les routes de signature renvoient une troisième variante, `BonForSignature`
 * (article de catalogue complet sur chaque équipement).
 *
 * Aucune de ces projections n'expose les colonnes `Bytes` du modèle Bon
 * (`pdfMiseDispoSnapshot`, `pdfRestitutionSnapshot`) ni `anonymizedAt` /
 * `archivedAt`, absentes du select.
 */
import type {
  BonStatus,
  Civilite,
  EquipmentCategory,
  IsoDateTime,
  NotificationStatus,
  NotificationType,
  OkResponse,
  PdfSnapshotType,
  SignatureType,
} from './common';
import type { CatalogItem } from './equipment';
import type { Filiale } from './filiales';

// ─── Sous-objets partagés ─────────────────────────────────────────────────────

/** Types de signature recueillis par lien (jeton) : tous sauf le cachet IT. */
export type LinkSignatureType = Exclude<SignatureType, 'it_cachet'>;

/**
 * Valeurs réellement écrites dans la colonne libre `Signature.pdfType` :
 * le type de la signature pour une signature par lien (signature/signing.ts),
 * l'étape choisie pour un cachet IT (signature/it-cachet.ts), `null` sinon.
 */
export type SignaturePdfType = LinkSignatureType;

/**
 * Filiale complète (`filiale: true`) : toutes les colonnes du modèle Filiale.
 * `stampPath` (fichier du cachet) n'est présent que dans les réponses
 * destinées à l'IT : un intercepteur global le retire de toute réponse envoyée
 * à un collaborateur ou à la direction (auth/interceptors).
 */
export interface BonFiliale extends Omit<Filiale, 'stampPath'> {
  stampPath?: string | null;
}

/** Collaborateur titulaire du bon (`email` est `null` pour un compte manuel). */
export interface BonCollaborateur {
  id: string;
  displayName: string;
  email: string | null;
  department: string | null;
}

/** Auteur du bon. */
export interface BonCreatedBy {
  id: string;
  displayName: string;
  email: string | null;
}

/** Article de catalogue abrégé d'une ligne d'équipement (fiche du bon). */
export interface BonCatalogItemSummary {
  id: string;
  brand: string;
  model: string;
  category: EquipmentCategory;
}

/** Article de catalogue complet (`catalogItem: true`) : toutes les colonnes
 *  du modèle EquipmentCatalog. */
export type BonCatalogItem = CatalogItem;

/** Colonnes d'une ligne d'équipement (modèle BonEquipment), hors relation. */
export interface BonEquipmentColumns {
  id: string;
  bonId: string;
  catalogItemId: string | null;
  customLabel: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  notes: string | null;
  order: number;
  returnedAt: IsoDateTime | null;
  notReturned: boolean;
  notReturnedReason: string | null;
  createdAt: IsoDateTime;
}

/** Ligne d'équipement de la fiche d'un bon, triée par `order`. */
export interface BonEquipment extends BonEquipmentColumns {
  catalogItem: BonCatalogItemSummary | null;
}

/**
 * Signature réduite aux champs publiables (`SIGNATURE_SAFE_SELECT` /
 * `toSafeSignature`, common/types.ts) : ni jeton, ni IP, ni navigateur, ni
 * chemin de l'image, ni sceau.
 */
export interface SafeSignature {
  id: string;
  type: SignatureType;
  signed: boolean;
  signedAt: IsoDateTime | null;
  signerEmail: string | null;
  mentionLuApprouve: boolean;
  isInPerson: boolean;
  tokenExpiresAt: IsoDateTime;
  createdAt: IsoDateTime;
  pdfType: SignaturePdfType | null;
}

// ─── Fiche d'un bon (BON_SELECT_SHAPE) ────────────────────────────────────────

/** Bon chargé avec le select canonique `BON_SELECT_SHAPE`. */
export interface BonDetail {
  id: string;
  reference: string;
  filialeId: string;
  collaborateurId: string;
  /** `null` pour un collaborateur sans adresse (signature présentielle seule). */
  collaborateurEmail: string | null;
  createdById: string;
  civilite: Civilite;
  status: BonStatus;
  /** Colonne `@db.Date` : minuit UTC. */
  dateMiseDisposition: IsoDateTime;
  /** Colonne `@db.Date` : minuit UTC. */
  dateRestitution: IsoDateTime | null;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  filiale: BonFiliale;
  collaborateur: BonCollaborateur;
  createdBy: BonCreatedBy;
  equipments: BonEquipment[];
  signatures: SafeSignature[];
}

/** GET /api/bons/:id — fiche d'un bon (IT, ou titulaire du bon quel que soit
 *  son rôle). */
export type BonDetailResponse = BonDetail;

// ─── Bon des routes de signature (BON_FOR_SIGNATURE_SELECT) ───────────────────

/** Ligne d'équipement avec l'article de catalogue complet. */
export interface BonForSignatureEquipment extends BonEquipmentColumns {
  catalogItem: BonCatalogItem | null;
}

/**
 * Bon chargé avec `BON_FOR_SIGNATURE_SELECT` (signature/select-shape.ts) puis
 * passé par `sanitizeBonForResponse` : même forme que `BonDetail`, sauf
 * l'article de catalogue, complet sur chaque équipement.
 */
export interface BonForSignature extends Omit<BonDetail, 'equipments'> {
  equipments: BonForSignatureEquipment[];
}

// ─── Liste paginée (BON_LIST_SELECT) ──────────────────────────────────────────

/** Ligne d'équipement de la liste (recherche globale, duplication). */
export interface BonListEquipment {
  id: string;
  customLabel: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  catalogItem: { id: string; brand: string; model: string } | null;
}

/** Signature NON signée d'un bon de la liste, de la plus récente à la plus ancienne. */
export interface BonListPendingSignature {
  type: SignatureType;
  /** Toujours `false` : la liste ne renvoie que les signatures en attente. */
  signed: false;
  createdAt: IsoDateTime;
}

/** Bon tel que renvoyé par la liste paginée. */
export interface BonListItem {
  id: string;
  reference: string;
  status: BonStatus;
  collaborateurEmail: string | null;
  dateMiseDisposition: IsoDateTime;
  dateRestitution: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  filiale: { id: string; displayName: string };
  collaborateur: { id: string; displayName: string; email: string | null };
  createdBy: { id: string; displayName: string };
  equipments: BonListEquipment[];
  signatures: BonListPendingSignature[];
}

/** GET /api/bons — liste paginée et filtrée (IT). `limit` est plafonné à 100. */
export interface BonListResponse {
  bons: BonListItem[];
  total: number;
  page: number;
  limit: number;
}

// ─── Tableau de bord ──────────────────────────────────────────────────────────

/** Nombre de bons non clos d'une filiale active (filiales à zéro omises). */
export interface BonStatsFiliale {
  id: string;
  /** Nom d'affichage de la filiale (`displayName`). */
  name: string;
  count: number;
}

/** GET /api/bons/stats — compteurs du tableau de bord (bons/queries/bon-stats.ts). */
export interface BonStatsResponse {
  waitingSignature: number;
  active: number;
  overdue: number;
  total: number;
  archivedThisMonth: number;
  partiallyReturned: number;
  overdueThresholdDays: number;
  byFiliale: BonStatsFiliale[];
}

/** GET /api/bons/recent?limit= — derniers bons créés (10 par défaut, 50 au plus). */
export type RecentBonsResponse = BonDetail[];

// ─── Portail collaborateur ────────────────────────────────────────────────────

/**
 * Signature d'un bon du portail (`mapCollaborateurBons`, common/types.ts).
 * `token` n'est présent que sur le lien réellement signable à distance (non
 * signé, hors cachet IT, non expiré, non présentiel) ; une signature
 * présentielle signable porte `inPersonPending: true` à la place. Les deux
 * clés sont absentes des autres signatures.
 */
export interface PortalSignature extends SafeSignature {
  token?: string;
  inPersonPending?: true;
}

/** Bon du portail : fiche canonique, signatures enrichies du lien signable. */
export interface PortalBon extends Omit<BonDetail, 'signatures'> {
  signatures: PortalSignature[];
}

/** GET /api/bons/mes-bons — bons du collaborateur connecté, hors brouillons et
 *  annulés, du plus récent au plus ancien (100 au plus). */
export type MyBonsResponse = PortalBon[];

// ─── Historique, intégrité, documents ─────────────────────────────────────────

/** Ligne du journal d'envoi des emails (toutes les colonnes de NotificationLog). */
export interface BonNotificationLog {
  id: string;
  bonId: string;
  recipientEmail: string;
  type: NotificationType;
  sentAt: IsoDateTime;
  status: NotificationStatus;
  errorMessage: string | null;
  reminderNumber: number | null;
}

/** GET /api/bons/:id/notifications — emails du bon, du plus récent au plus ancien. */
export type BonNotificationsResponse = BonNotificationLog[];

/** Contrôle du sceau HMAC d'une signature signée (signature/seal.ts). */
export interface SignatureIntegrity {
  id: string;
  type: SignatureType;
  /** Toujours `true` : seules les signatures signées sont contrôlées. */
  signed: true;
  sealed: boolean;
  /** `null` : non scellée, ou bon anonymisé (sceau non recalculable). */
  sealValid: boolean | null;
  timestamped: boolean;
  timestampAuthority: string | null;
  signedAt: IsoDateTime | null;
}

/** GET /api/bons/:id/integrity — vérification des sceaux des signatures. */
export interface BonIntegrityResponse {
  allValid: boolean;
  anonymized: boolean;
  signatures: SignatureIntegrity[];
}

/** Document de preuve PDF enregistré pour le bon (sans son contenu). */
export interface PdfSnapshotInfo {
  type: PdfSnapshotType;
  filename: string;
  createdAt: IsoDateTime;
  sha256: string | null;
}

/** GET /api/bons/:id/pdf-snapshots — documents enregistrés, du plus ancien au plus récent. */
export type PdfSnapshotsResponse = PdfSnapshotInfo[];

/** GET /api/bons/:id/pdf-snapshots/missing — documents attendus (signature
 *  signée) mais absents. */
export interface MissingPdfSnapshotsResponse {
  missing: PdfSnapshotType[];
}

// ─── Actions du cycle de vie (réponses de succès) ─────────────────────────────

/** POST /api/bons — création d'un brouillon (201). */
export type CreateBonResponse = BonDetail;

/** PUT /api/bons/:id — modification d'un brouillon. */
export type UpdateBonResponse = BonDetail;

/** DELETE /api/bons/:id — annulation (le bon passe en `cancelled`). */
export type CancelBonResponse = BonDetail;

/** POST /api/bons/:id/send — envoi du lien de mise à disposition (201).
 *  Erreur particulière : `SerialConflictsErrorBody` (409). */
export type SendBonResponse = BonDetail;

/** POST /api/bons/:id/initiate-restitution — lancement de la restitution (201). */
export type InitiateRestitutionResponse = BonDetail;

/** POST /api/bons/:id/initiate-inperson — signature présentielle (201) : le
 *  bon et le jeton du lien à ouvrir sur place. */
export interface InitiateInPersonResponse {
  bon: BonDetail;
  token: string;
}

/** POST /api/bons/:id/declare-not-returned — déclaration d'équipements non rendus (201). */
export type DeclareNotReturnedResponse = BonDetail;

/** POST /api/bons/:id/mark-found — équipements retrouvés (201). */
export type MarkFoundResponse = BonDetail;

/** POST /api/bons/:id/close-unilateral — clôture sans signature du collaborateur (201). */
export type CloseUnilateralResponse = BonDetail;

/** Cachet IT tel que renvoyé par la signature IT. */
export interface ItCachetSignature extends SafeSignature {
  type: 'it_cachet';
  signed: true;
  signedAt: IsoDateTime;
  pdfType: 'mise_disposition' | 'restitution' | null;
}

/** POST /api/bons/:id/sign-it — cachet IT apposé dans l'application (201). Un
 *  second appel dans les 10 secondes renvoie le cachet déjà enregistré. */
export interface SignItResponse extends OkResponse {
  bon: BonForSignature;
  signature: ItCachetSignature;
}

/** POST /api/bons/:id/resend — renvoi du lien de signature (201).
 *  Erreur particulière : `TokenRecentErrorBody` (409). */
export interface ResendLinkResponse extends OkResponse {
  message: string;
}

/** Compte rendu d'un bon de la relance groupée : lien renvoyé. */
export interface ResendBatchSent {
  id: string;
  outcome: 'sent';
}

/** Compte rendu d'un bon de la relance groupée : refus métier. `code` et
 *  `sentAt` ne sont présents que pour un lien envoyé il y a moins d'une heure. */
export interface ResendBatchSkipped {
  id: string;
  outcome: 'skipped';
  reason: string;
  code?: 'token_recent';
  sentAt?: IsoDateTime;
}

/** Compte rendu d'un bon de la relance groupée : erreur inattendue. */
export interface ResendBatchFailed {
  id: string;
  outcome: 'failed';
  reason: string;
}

export type ResendBatchItem = ResendBatchSent | ResendBatchSkipped | ResendBatchFailed;

/** POST /api/bons/resend-batch — relance groupée (200), un compte rendu par bon
 *  (identifiants dédoublonnés, dans l'ordre reçu). */
export interface ResendBatchResponse {
  results: ResendBatchItem[];
  sent: number;
  skipped: number;
  failed: number;
}

// ─── Erreurs à corps particulier ──────────────────────────────────────────────

/** Numéro de série du bon déjà en circulation sur un autre bon actif. */
export interface SendSerialConflict {
  serialNumber: string;
  bonReference: string;
}

/** POST /api/bons/:id/send — 409 sans `statusCode` : numéros de série déjà en
 *  circulation ; renvoyer avec `{ confirmSerialConflicts: true }` pour passer outre. */
export interface SerialConflictsErrorBody {
  code: 'serial_conflicts';
  conflicts: SendSerialConflict[];
}

/** POST /api/bons/:id/resend — 409 sans `statusCode` : un lien a été envoyé il
 *  y a moins d'une heure ; renvoyer avec `{ force: true }` pour confirmer. */
export interface TokenRecentErrorBody {
  code: 'token_recent';
  sentAt: IsoDateTime;
}
