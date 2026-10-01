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
 *
 * Vague 2 de la refonte : les champs marqués « renseigné par le lot 2A /
 * 2B » sont déclarés d'avance (lot 2-0) et FACULTATIFS le temps de la vague,
 * pour que chaque lot les remplisse sans casser les autres. À la fin de la
 * vague 2, les rendre obligatoires (retirer le `?`) et mettre à jour les
 * formes de `test/contract/shapes/`.
 */
import type {
  BonStatus,
  Civilite,
  SignatureInvalidationReason,
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
 * Sous-état d'un bon « Restitution en cours » (`partially_returned`), calculé
 * par le serveur ; `null` pour tout autre statut. Si plusieurs s'appliquent,
 * le premier de cette liste l'emporte :
 *  - `pv_to_sign` : un PV de non-restitution attend la signature du
 *    collaborateur (lien valide ou expiré) ;
 *  - `partial_restitution_to_sign` : des équipements marqués rendus attendent
 *    la signature de leur restitution ;
 *  - `loss_declared` : des équipements sont déclarés non restitués, aucune
 *    signature n'est attendue ;
 *  - `equipment_still_out` : aucune signature attendue, des équipements sont
 *    encore chez le collaborateur.
 * Libellés : `BON_SUB_STATUS_LABELS` (bons/bon-status.ts, domain/labels.ts).
 */
export type BonSubStatus = 'pv_to_sign' | 'partial_restitution_to_sign' | 'loss_declared' | 'equipment_still_out';

/**
 * Document qui attend la signature du collaborateur, calculé depuis l'état
 * métier du bon (pas depuis l'existence d'une ligne de signature, que la purge
 * peut avoir supprimée) ; `null` si rien n'attend sa signature. Non nul, la
 * fiche et la liste proposent « Renvoyer » et « Afficher le lien présentiel »,
 * lien expiré compris (R-005).
 */
export interface PendingSignature {
  type: LinkSignatureType;
  /** Aucun lien valide : le dernier a expiré, a été invalidé ou purgé, ou
   *  aucun n'a encore été envoyé pour cette demande. */
  expired: boolean;
  /** Le dernier lien est un lien présentiel (guichet). */
  inPerson: boolean;
  /** La signature IT de ce document est posée pour la demande en cours : sans
   *  elle, aucun lien ne part (R-022). Toujours vrai pour le PV, dont la
   *  signature IT est recueillie à la déclaration de non-restitution. */
  itSigned: boolean;
  /** Date d'envoi du dernier lien de ce document, `null` si aucun. */
  sentAt: IsoDateTime | null;
  /** Échéance du dernier lien, `null` s'il n'y en a pas ou s'il a été invalidé. */
  expiresAt: IsoDateTime | null;
  /** Le collaborateur a demandé un nouveau lien depuis l'envoi du dernier :
   *  date de sa demande (l'IT a été prévenue une fois, ne la réalertez pas),
   *  `null` sinon. Renseigné par `GET /bons/mes-bons` et `GET /bons/:id`. */
  newLinkRequestedAt?: IsoDateTime | null;
}

/**
 * Actions du cycle de vie d'un bon, calculées par la machine à états
 * (bons/workflow/state-machine.ts) :
 *  - `edit` : modifier (brouillon, ou bon envoyé pas encore signé : nouvelle
 *    signature IT et nouveau lien) ;
 *  - `send` / `send_in_person` : envoyer le lien de remise par email / faire
 *    signer la remise au guichet ;
 *  - `resend` / `show_in_person_link` : renvoyer le lien du document en attente
 *    / l'afficher pour une signature sur place (y compris le PV) ;
 *  - `start_restitution` / `restitution_in_person` : lancer une restitution
 *    (sélection des équipements rendus), par email / au guichet ;
 *  - `undo_return` : annuler le marquage « rendu » avant la signature ;
 *  - `declare_not_returned` / `mark_found` : déclarer un équipement non
 *    restitué / retrouvé ;
 *  - `handover_without_signature` / `close_without_signature` : les deux gestes
 *    sans signature, avec motif ;
 *  - `cancel` : annuler le bon, avec motif.
 */
export type BonActionName =
  | 'edit'
  | 'send'
  | 'send_in_person'
  | 'resend'
  | 'show_in_person_link'
  | 'start_restitution'
  | 'restitution_in_person'
  | 'undo_return'
  | 'declare_not_returned'
  | 'mark_found'
  | 'handover_without_signature'
  | 'close_without_signature'
  | 'cancel';

/** Action proposée sur la fiche d'un bon. */
export interface BonAvailableAction {
  action: BonActionName;
  /** Ce qu'il y a à faire maintenant (au plus une action principale). */
  primary: boolean;
  /** Pourquoi l'action est visible mais impossible (envoi vers un compte
   *  désactivé, par exemple) ; `null` si elle est possible. */
  blockedReason: string | null;
}

/**
 * Où en est un équipement, calculé par le serveur :
 *  - `out` : chez le collaborateur ;
 *  - `returned_to_sign` : rendu, restitution à signer ;
 *  - `returned` : rendu, restitution signée (ou bon clôturé) ;
 *  - `not_returned` : déclaré non restitué ;
 *  - `replaced` : bon clôturé « remplacé » (contestation Fondée sur la
 *    remise) : l'équipement n'est plus suivi sur ce bon mais sur le bon
 *    remplaçant (`replacedBy`), jamais « chez le collaborateur » en double.
 */
export type EquipmentReturnState = 'out' | 'returned_to_sign' | 'returned' | 'not_returned' | 'replaced';

/** Retards d'un bon, en jours (`null` : pas en retard). */
export interface BonLateness {
  /** « Signature en retard » : document en attente depuis plus que le seuil. */
  signatureDays: number | null;
  /** « Retour en retard » : date de restitution prévue dépassée, équipements
   *  encore chez le collaborateur. */
  returnDays: number | null;
}

/** Motif pour lequel aucun lien ne peut être envoyé au collaborateur
 *  (`canSendLink`, common/can-send-link.ts). */
export type LinkRefusalReason = 'inactive_account' | 'no_email' | 'undeliverable_email';

/** Refus d'envoi d'un lien, avec le message français à afficher (R-009). */
export interface LinkRefusal {
  reason: LinkRefusalReason;
  message: string;
}

/** Autre bon, cité par sa référence. */
export interface BonRef {
  id: string;
  reference: string;
}

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
  /** Civilité mémorisée sur le compte (`User.civilite`), `null` tant
   *  qu'aucune n'a été choisie ; proposée au bon suivant (R-002).
   *  Renseigné par le lot 2A. */
  civilite?: Civilite | null;
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
  /** Où en est l'équipement. Renseigné par le lot 2A (fiche IT et titulaire). */
  returnState?: EquipmentReturnState;
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
  /** Lien invalidé avant usage : quand. Renseigné par le lot 2B. */
  invalidatedAt?: IsoDateTime | null;
  /** Lien invalidé avant usage : pourquoi (`null` : lien valide, expiré, ou
   *  motif inconnu). Renseigné par le lot 2B. */
  invalidatedReason?: SignatureInvalidationReason | null;
  /** Signature au guichet recueillie par un autre compte que le titulaire
   *  (`signerEmail` est alors celui du technicien présent). Renseigné par le
   *  lot 2A sur la fiche. */
  signedByProxy?: boolean;
  /** Nom du compte de `signerEmail` (technicien d'une signature IT, témoin au
   *  guichet), `null` si l'adresse ne correspond à aucun compte. Renseigné sur
   *  la fiche IT seulement. */
  signerName?: string | null;
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
  /** « Remarques sur le bon » : visibles par le collaborateur et sur le PDF. */
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  filiale: BonFiliale;
  collaborateur: BonCollaborateur;
  createdBy: BonCreatedBy;
  equipments: BonEquipment[];
  signatures: SafeSignature[];
  /** « Note interne IT » (R-170) : JAMAIS renvoyée au collaborateur (absente
   *  du portail, de la page de signature et de la fiche vue par le titulaire).
   *  Renseigné par le lot 2A. */
  internalNote?: string | null;
  /** Sous-état de « Restitution en cours ». Renseigné par le lot 2A. */
  subStatus?: BonSubStatus | null;
  /** Document en attente de signature. Renseigné par le lot 2A. */
  pendingSignature?: PendingSignature | null;
  /** Pourquoi aucun lien ne peut être envoyé (`null` : envoi possible).
   *  Réservé à l'IT. Renseigné par le lot 2A. */
  linkRefusal?: LinkRefusal | null;
  /** Début de l'attente de signature du document courant. Renseigné par le lot 2A. */
  awaitingSince?: IsoDateTime | null;
  /** Motif d'annulation. Renseigné par le lot 2A. */
  cancellationReason?: string | null;
  /** Motif de « Constater la remise sans signature ». Renseigné par le lot 2A. */
  handoverWithoutSignatureReason?: string | null;
  /** Motif de « Clôturer sans signature ». Renseigné par le lot 2A. */
  closedWithoutSignatureReason?: string | null;
  /** Bon que celui-ci remplace (contestation Fondée). Renseigné par le lot 2A. */
  replaces?: BonRef | null;
  /** Bon qui remplace celui-ci : « Clôturé — remplacé par … ». Renseigné par le lot 2A. */
  replacedBy?: BonRef | null;
  /** Retards (« Signature en retard », « Retour en retard »). Renseigné par le lot 2A. */
  lateness?: BonLateness;
  /** Compte du collaborateur désactivé (départ) : date de désactivation
   *  inconnue, seul l'état est connu. Renseigné par le lot 2A. */
  collaborateurActive?: boolean;
  /** Actions possibles maintenant, l'action principale en tête (machine à
   *  états). Réservé à l'IT. Renseigné par le lot 2A. */
  availableActions?: BonAvailableAction[];
  /** Contestation à rappeler sur la fiche (voir `BonContestationNotice`),
   *  `null` sinon. Réservé à l'IT. */
  contestation?: BonContestationNotice | null;
  /** Le collaborateur a demandé un nouveau lien pour le document en attente,
   *  depuis le dernier envoi ; `null` sinon. Réservé à l'IT. */
  linkRequest?: BonLinkRequest | null;
}

/**
 * Contestation rappelée sur la fiche IT :
 *  - `open` : en attente de décision (bon « Contesté ») — la fiche propose
 *    « Traiter la contestation » ;
 *  - `correction` : Fondée sur une restitution ou un PV, le bon est rouvert et
 *    rien n'a encore été corrigé (ni marquage, ni nouvelle signature IT, ni
 *    nouveau lien) — la fiche met la correction en action principale.
 */
export interface BonContestationNotice {
  id: string;
  stage: 'open' | 'correction';
  /** Motif écrit par le collaborateur. */
  message: string;
  createdAt: IsoDateTime;
  /** Document contesté (`null` pour une contestation d'avant la vague 2). */
  contestedDocument: LinkSignatureType | null;
  /** « Pris en charge par ». */
  reviewedBy: { id: string; displayName: string } | null;
  /** Date de la décision (étape `correction`), `null` tant qu'elle est ouverte. */
  resolvedAt: IsoDateTime | null;
  /** Réponse de l'IT au collaborateur (étape `correction`). */
  resolutionMessage: string | null;
}

/** Demande de nouveau lien faite par le collaborateur (lien expiré). */
export interface BonLinkRequest {
  requestedAt: IsoDateTime;
  /** Document concerné. */
  documentType: LinkSignatureType;
}

/** Champs de la fiche réservés à l'équipe informatique : jamais renvoyés au
 *  collaborateur, même titulaire du bon. */
export type BonItOnlyField = 'internalNote' | 'linkRefusal' | 'availableActions' | 'contestation' | 'linkRequest';

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
export interface BonForSignature extends Omit<BonDetail, 'equipments' | BonItOnlyField> {
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
  /** Sous-état de « Restitution en cours ». Renseigné par le lot 2A. */
  subStatus?: BonSubStatus | null;
  /** Document en attente de signature (bouton « Renvoyer » de la liste).
   *  Renseigné par le lot 2A. */
  pendingSignature?: PendingSignature | null;
  /** Retards. Renseigné par le lot 2A. */
  lateness?: BonLateness;
  /** Un lien peut être envoyé par email au collaborateur (canSendLink).
   *  Renseigné par le lot 2A. */
  canSendLink?: boolean;
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
 * Signature d'un bon du portail (`mapCollaborateurBons`, bons/bon-mappers.ts).
 * `token` n'est présent que sur le lien réellement signable à distance (non
 * signé, hors signature IT, non expiré, non présentiel, non invalidé) et sur le
 * DERNIER lien par email expiré (non invalidé), pour « Demander un nouveau
 * lien » : `tokenExpiresAt` les distingue. Une signature présentielle
 * signable porte `inPersonPending: true` à la place. Les deux clés sont
 * absentes des autres signatures.
 */
export interface PortalSignature extends SafeSignature {
  token?: string;
  inPersonPending?: true;
}

/** Bon du portail : fiche canonique sans les champs réservés à l'IT,
 *  signatures enrichies du lien signable. */
export interface PortalBon extends Omit<BonDetail, 'signatures' | BonItOnlyField> {
  signatures: PortalSignature[];
}

/** GET /api/bons/mes-bons — bons du collaborateur connecté, hors brouillons et
 *  annulés, du plus récent au plus ancien (100 au plus), avec l'état calculé
 *  vu par le titulaire (sous-état, document en attente, `replacedBy`, état
 *  de chaque équipement). */
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
  /** Document d'une demande de signature ou d'un rappel (les rappels se
   *  comptent par document) ; `null` pour les autres emails. */
  documentType: LinkSignatureType | null;
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

/**
 * Document de preuve PDF enregistré pour le bon (sans son contenu). Un
 * document par signature, jamais écrasé : un même `type` peut revenir
 * plusieurs fois (deux restitutions, remise signée de nouveau après une
 * modification), chacun avec sa propre date et sa propre empreinte.
 */
export interface PdfSnapshotInfo {
  /** Identifiant du document : `GET /api/bons/:id/pdf?snapshot=<id>` le télécharge. */
  id: string;
  type: PdfSnapshotType;
  /** Nom lisible du fichier (référence, collaborateur, document, date et heure). */
  filename: string;
  /** Moment où le document a été produit (celui de sa signature). */
  createdAt: IsoDateTime;
  /** Empreinte SHA-256 : la même que celle tracée dans le journal d'audit. */
  sha256: string | null;
  /** Type de la signature dont ce document est la preuve : `it_cachet` pour
   *  une version signée par l'IT seule (PV émis, signature IT d'une remise ou
   *  d'une restitution), le type du collaborateur quand il a signé ce
   *  document. `null` : geste sans signature, ou document antérieur. */
  signatureType: SignatureType | null;
  /** Rang du document parmi ceux du même type, du plus ancien (1) au plus récent. */
  sequence: number;
  /** Nombre de documents de ce type sur le bon (« Restitution 1 sur 2 »). */
  sequenceCount: number;
  /** `true` pour le plus récent document de son type : la version en vigueur. */
  latest: boolean;
  /** Le document ne vaut plus : sa signature a été invalidée (bon modifié,
   *  marquage annulé, contestation fondée…). Quand et pourquoi ; `null` sinon. */
  supersededAt: IsoDateTime | null;
  supersededReason: SignatureInvalidationReason | null;
}

/** GET /api/bons/:id/pdf-snapshots — TOUS les documents enregistrés, du plus
 *  ancien au plus récent (ordre de production, puis identifiant). */
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

/** POST /api/bons/:id/cancel — annulation (le bon passe « Annulé »), motif
 *  obligatoire pour un bon envoyé ; DELETE /api/bons/:id reste accepté. */
export type CancelBonResponse = BonDetail;

/** POST /api/bons/:id/handover-without-signature — « Constater la remise sans
 *  signature » (motif) : Remise à signer → En cours (201). */
export type HandoverWithoutSignatureResponse = BonDetail;

/** POST /api/bons/:id/close-without-signature — « Clôturer sans signature »
 *  (motif) : → Clôturé (201). */
export type CloseWithoutSignatureResponse = BonDetail;

/** POST /api/bons/:id/undo-return — annulation du marquage « rendu »
 *  d'équipements dont la restitution n'est pas encore signée (201). */
export type UndoReturnResponse = BonDetail;

/** Ligne d'un bon qu'aucun numéro (série ou inventaire) n'identifie. */
export interface MissingSerialLine {
  equipmentId: string;
  /** Position de la ligne dans le bon, à partir de 1. */
  position: number;
  /** Article du catalogue ou désignation libre. */
  label: string;
}

/** GET /api/bons/:id/send-check — contrôles avant la remise (email ou guichet),
 *  à afficher AVANT la signature IT (R-003). */
export interface SendChecksResponse {
  missingSerials: MissingSerialLine[];
  serialConflicts: SendSerialConflict[];
}

/** POST /api/bons/:id/send — envoi du lien de mise à disposition (201), avec
 *  `{ confirmSerialConflicts?, confirmMissingSerials? }`. Exige la signature
 *  IT de la remise (400 sinon). Erreurs particulières :
 *  `MissingSerialsErrorBody` puis `SerialConflictsErrorBody` (409). */
export type SendBonResponse = BonDetail;

/** POST /api/bons/:id/initiate-restitution — marquage des équipements rendus
 *  (`{ returnedEquipmentIds, inPerson? }`, 201). Aucun lien ne part encore :
 *  la signature IT de la restitution vient d'abord, puis le lien (renvoi par
 *  email, ou `initiate-inperson` au guichet). */
export type InitiateRestitutionResponse = BonDetail;

/** POST /api/bons/:id/initiate-inperson — signature au guichet (201) du
 *  document `type` (`mise_disposition`, `restitution`, `pv_cloture`) : le bon
 *  et le jeton du lien à ouvrir sur place. */
export interface InitiateInPersonResponse {
  bon: BonDetail;
  token: string;
}

/** POST /api/bons/:id/declare-not-returned — déclaration d'équipements non rendus (201). */
export type DeclareNotReturnedResponse = BonDetail;

/** POST /api/bons/:id/mark-found — équipements retrouvés (201). */
export type MarkFoundResponse = BonDetail;

/** POST /api/bons/:id/close-unilateral — ancien nom des deux gestes sans
 *  signature (remise constatée depuis « Remise à signer », clôture sinon),
 *  gardé pour compatibilité (201). */
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

/** POST /api/bons/:id/send et initiate-inperson — 409 sans `statusCode` : des
 *  lignes n'ont ni numéro de série ni numéro d'inventaire ; renvoyer avec
 *  `{ confirmMissingSerials: true }` pour passer outre (tracé dans l'audit). */
export interface MissingSerialsErrorBody {
  code: 'missing_serials';
  lines: MissingSerialLine[];
}

/** POST /api/bons/:id/resend — 409 sans `statusCode` : un lien a été envoyé il
 *  y a moins d'une heure ; renvoyer avec `{ force: true }` pour confirmer. */
export interface TokenRecentErrorBody {
  code: 'token_recent';
  sentAt: IsoDateTime;
}
