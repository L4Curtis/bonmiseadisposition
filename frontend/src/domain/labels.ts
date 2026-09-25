import type { BonStatus, UserRole } from '@/types';

/**
 * LEXIQUE de l'application : un objet = un mot, partout (menu, titres,
 * boutons, messages). Décisions du propriétaire du 24/09/2026.
 *
 * Règle : un écran n'écrit jamais un libellé métier en dur, il le lit ici.
 * Le serveur a son propre fichier de libellés (emails, PDF, exports) qui
 * emploie les MÊMES mots ; changer un mot, c'est changer les deux.
 *
 * | Notion                          | Mot retenu              | Ne plus écrire                      |
 * |---------------------------------|-------------------------|-------------------------------------|
 * | Page de gestion des comptes     | Utilisateurs            | Collaborateurs (menu)               |
 * | Personne qui reçoit du matériel | collaborateur           | —                                   |
 * | Ligne du catalogue              | article                 | équipement (au catalogue)           |
 * | Objet physique prêté            | équipement              | matériel                            |
 * | Matériel qui ne revient pas     | non restitué            | non rendu                           |
 * | Image du tampon                 | cachet de la filiale    | cachet                              |
 * | Tracé du technicien             | signature IT            | cachet IT                           |
 * | Document de perte               | PV de non-restitution   | PV de clôture, PV équipements…      |
 * | Deux retards                    | Signature / Retour en retard | En retard (seul)               |
 * | Issue de contestation           | Fondée / Non retenue    | Résolue / Rejetée                   |
 */

// ─── Mots du métier (dans une phrase, en minuscules) ─────────────────────────

export const TERMS = {
  bon: 'bon',
  collaborator: 'collaborateur',
  article: 'article',
  equipment: 'équipement',
  notReturned: 'non restitué',
  itSignature: 'signature IT',
  filialeStamp: 'cachet de la filiale',
  nonReturnReport: 'PV de non-restitution',
  closureWithoutSignature: 'clôture sans signature',
} as const;

// ─── Bon ─────────────────────────────────────────────────────────────────────

/** Statut du bon. La valeur interne `archived` reste, le mot affiché est « Clôturé ». */
export const BON_STATUS_LABELS: Readonly<Record<BonStatus, string>> = {
  draft: 'Brouillon',
  sent_mise_dispo: 'Remise à signer',
  active: 'En cours',
  sent_restitution: 'Restitution à signer',
  partially_returned: 'Restitution en cours',
  archived: 'Clôturé',
  cancelled: 'Annulé',
  contested: 'Contesté',
};

/**
 * Sous-état d'un bon « Restitution en cours », calculé par le serveur.
 * Clés provisoires : le lot qui fait calculer ce sous-état au serveur les
 * confirme et les aligne sur sa réponse.
 */
export const RESTITUTION_STEP_LABELS = {
  pv_to_sign: 'PV à signer',
  partial_restitution_to_sign: 'Restitution partielle à signer',
  equipment_still_out: 'Équipements encore chez le collaborateur',
  loss_declared: 'Perte déclarée',
} as const;

export type RestitutionStep = keyof typeof RESTITUTION_STEP_LABELS;

/** Les deux retards : toujours qualifiés, jamais « En retard » seul. */
export const LATENESS_LABELS = {
  /** Document envoyé, pas encore signé au-delà du délai. */
  signature: 'Signature en retard',
  /** Date de restitution prévue dépassée, équipements pas revenus. */
  return: 'Retour en retard',
} as const;

// ─── Comptes ─────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: 'Administrateur',
  technician: 'Technicien',
  direction: 'Direction',
  collaborator: 'Collaborateur',
};

// ─── Catalogue ───────────────────────────────────────────────────────────────

/** Catégories d'articles (énumération serveur `EquipmentCategory`) — mêmes
 *  mots que l'export CSV et l'inventaire du serveur. */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  pc_portable: 'PC portable',
  pc_fixe: 'PC fixe',
  ecran: 'Écran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Téléphone',
  housse: 'Housse',
  dock: 'Station d’accueil',
  cable: 'Câble',
  autre: 'Autre',
};

// ─── Documents et signatures ─────────────────────────────────────────────────

/** Étape de signature (énumération serveur `SignatureType`), en titre. */
export const SIGNATURE_TYPE_LABELS: Readonly<Record<string, string>> = {
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV de non-restitution',
  it_cachet: 'Signature IT',
};

/** Document que signe le collaborateur, dans une phrase (« signer le … »). */
export const DOCUMENT_LABELS: Readonly<Record<string, string>> = {
  mise_disposition: 'bon de mise à disposition',
  restitution: 'bon de restitution',
  pv_cloture: 'PV de non-restitution',
};

/** Étape de signature au milieu d'une phrase (« Bon de restitution à signer ») ;
 *  le PV garde son nom. Type absent ou inconnu : mise à disposition. */
export function signatureStepInSentence(type: string | undefined): string {
  if (type === 'pv_cloture') return TERMS.nonReturnReport;
  if (type === 'restitution') return 'restitution';
  return 'mise à disposition';
}

/** Document signé en début de phrase : « Le bon de restitution », « Le PV de non-restitution ». */
export function signedDocumentPhrase(type: string | undefined): string {
  const document = type && Object.prototype.hasOwnProperty.call(DOCUMENT_LABELS, type)
    ? DOCUMENT_LABELS[type]
    : DOCUMENT_LABELS.mise_disposition;
  return `Le ${document}`;
}

/** Version figée du PDF (énumération serveur `PdfSnapshotType`). */
export const PDF_SNAPSHOT_LABELS: Readonly<Record<string, string>> = {
  signature_it_mise_disposition: 'Signature IT — mise à disposition',
  signature_collab_mise_disposition: 'Signature du collaborateur — mise à disposition',
  signature_it_restitution: 'Signature IT — restitution',
  signature_collab_restitution: 'Signature du collaborateur — restitution',
  cloture_equipements_manquants: 'PV de non-restitution',
  avenant_equipement_retrouve: 'Avenant — équipement retrouvé',
};

/** Étape d'un modèle PDF (paramètre `stage`). */
export const PDF_STAGE_LABELS: Readonly<Record<string, string>> = {
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV de non-restitution',
  general: 'Général',
};

// ─── Contestations ───────────────────────────────────────────────────────────

export const CONTESTATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  open: 'Ouverte',
  in_review: "En cours d'examen",
  resolved: 'Fondée',
  rejected: 'Non retenue',
};

/** Options du filtre de statut (liste des contestations). */
export const CONTESTATION_STATUS_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  ...Object.entries(CONTESTATION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

// ─── Notifications (journal des envois) ──────────────────────────────────────

/** Type d'email envoyé (énumération serveur `NotificationType`). */
export const NOTIFICATION_TYPE_LABELS: Readonly<Record<string, string>> = {
  mise_dispo_request: 'Demande de signature — mise à disposition',
  restitution_request: 'Demande de signature — restitution',
  pv_cloture_request: 'Demande de signature — PV de non-restitution',
  reminder: 'Rappel',
  restitution_due_reminder: 'Rappel avant la date de restitution',
  confirmation: 'Confirmation de signature',
  contestation_alert: 'Alerte contestation',
  contestation_resolution: 'Issue de la contestation',
  cancellation: 'Annulation du bon',
  mark_found: 'Équipement retrouvé',
  unilateral_closure: 'Clôture sans signature',
};

// ─── Écrans (menu, titres de page, onglet du navigateur) ─────────────────────

export const SCREEN_LABELS = {
  dashboard: 'Tableau de bord',
  bons: 'Bons',
  newBon: 'Nouveau bon',
  editBon: 'Modifier le bon',
  bon: 'Bon',
  inventaire: 'Inventaire',
  equipment: 'Équipement',
  contestations: 'Contestations',
  utilisateurs: 'Utilisateurs',
  filiales: 'Filiales',
  catalogue: 'Catalogue',
  configuration: 'Configuration',
  modeles: 'Modèles',
  emailTemplates: "Modèles d'emails",
  pdfTemplates: 'Modèles PDF',
  annuaire: 'Active Directory',
  journal: "Journal d'audit",
  mesEquipements: 'Mes équipements',
  connexion: 'Connexion',
  motDePasse: 'Changer le mot de passe',
  signature: 'Signature',
  accesRefuse: 'Accès refusé',
  introuvable: 'Page introuvable',
} as const;

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Libellé d'une valeur, ou la valeur brute si elle est inconnue (nouvelle
 *  valeur côté serveur) : l'écran reste lisible au lieu d'afficher un vide. */
export function labelOrKey(labels: Readonly<Record<string, string>>, key: string): string {
  return Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : key;
}

export const bonStatusLabel = (status: string): string => labelOrKey(BON_STATUS_LABELS, status);
export const roleLabel = (role: string): string => labelOrKey(ROLE_LABELS, role);
export const categoryLabel = (category: string): string => labelOrKey(CATEGORY_LABELS, category);
export const notificationTypeLabel = (type: string): string => labelOrKey(NOTIFICATION_TYPE_LABELS, type);
