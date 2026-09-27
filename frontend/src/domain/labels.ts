import type { BonStatus, UserRole } from '@/types';
import type {
  BonSubStatus,
  Civilite,
  ContestationOutcome,
  NotificationStatus,
  SignatureInvalidationReason,
} from '@/contracts';

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
 * | Deux gestes sans signature      | Constater la remise / Clôturer sans signature | Clôture unilatérale |
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
 * Sous-état d'un bon « Restitution en cours », calculé par le serveur
 * (champ `subStatus`, voir `BonSubStatus` dans contracts/bons.ts), dans son
 * ordre de priorité : si plusieurs s'appliquent, le premier l'emporte.
 */
export const BON_SUB_STATUS_LABELS: Readonly<Record<BonSubStatus, string>> = {
  pv_to_sign: 'PV de non-restitution à signer',
  partial_restitution_to_sign: 'Restitution partielle à signer',
  loss_declared: 'Perte déclarée',
  equipment_still_out: 'Équipements encore chez le collaborateur',
};

/** Les deux gestes « sans signature », distincts : l'un ouvre le prêt,
 *  l'autre le termine. Clés partagées avec le serveur (événements, emails). */
export type WithoutSignatureAction = 'handover_without_signature' | 'closed_without_signature';

/** Nom du bouton. */
export const WITHOUT_SIGNATURE_ACTION_LABELS: Readonly<Record<WithoutSignatureAction, string>> = {
  handover_without_signature: 'Constater la remise sans signature',
  closed_without_signature: 'Clôturer sans signature',
};

/** Ce qui s'est passé (historique, en-tête de fiche, document). */
export const WITHOUT_SIGNATURE_DONE_LABELS: Readonly<Record<WithoutSignatureAction, string>> = {
  handover_without_signature: 'Remise constatée sans signature',
  closed_without_signature: 'Clôturé sans signature',
};

/** Civilité abrégée, devant le nom (formulaire, fiche, page de signature). */
export const CIVILITE_LABELS: Readonly<Record<Civilite, string>> = { mme: 'Mme', mr: 'M.' };

/** Civilité en toutes lettres. */
export const CIVILITE_LONG_LABELS: Readonly<Record<Civilite, string>> = { mme: 'Madame', mr: 'Monsieur' };

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
  remise_sans_signature: 'Remise constatée sans signature',
  cloture_sans_signature: 'Clôture sans signature',
};

/** Pourquoi un lien de signature a été invalidé avant usage : libellé court
 *  pour l'équipe informatique (fiche du bon). */
export const LINK_INVALIDATION_LABELS: Readonly<Record<SignatureInvalidationReason, string>> = {
  replaced: 'Remplacé par un nouveau lien',
  in_person: 'Signature au guichet',
  modified: 'Bon modifié',
  cancelled: 'Bon annulé',
  contested: 'Bon contesté',
  handover_without_signature: 'Remise constatée sans signature',
  closed_without_signature: 'Clôturé sans signature',
  account_deactivated: 'Compte désactivé',
};

/** Même motif, en message au collaborateur qui ouvre le lien (page de signature). */
export const LINK_INVALIDATION_MESSAGES: Readonly<Record<SignatureInvalidationReason, string>> = {
  replaced: 'Ce lien a été remplacé : un nouveau lien vous a été envoyé par email.',
  in_person: "Ce document se signe au guichet, avec l'équipe informatique.",
  modified: 'Ce bon a été modifié : un nouveau lien vous sera envoyé.',
  cancelled: "Ce bon a été annulé : il n'y a plus rien à signer.",
  contested: "Votre contestation est en cours de traitement : il n'y a rien à signer pour l'instant.",
  handover_without_signature: "La remise a été enregistrée sans votre signature : il n'y a plus rien à signer.",
  closed_without_signature: "Ce bon a été clôturé : il n'y a plus rien à signer.",
  account_deactivated: "Votre compte est désactivé : adressez-vous à l'équipe informatique.",
};

/** Étape d'un modèle PDF (paramètre `stage`). */
export const PDF_STAGE_LABELS: Readonly<Record<string, string>> = {
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV de non-restitution',
  general: 'Général',
};

// ─── Contestations ───────────────────────────────────────────────────────────

/** Issue d'une contestation tranchée (champ `outcome`). */
export const CONTESTATION_OUTCOME_LABELS: Readonly<Record<ContestationOutcome, string>> = {
  founded: 'Fondée',
  not_retained: 'Non retenue',
};

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
  handover_without_signature: 'Remise constatée sans signature',
  contestation_overdue_alert: 'Relance : contestation non traitée',
  link_request_alert: "Demande d'un nouveau lien",
};

/** Résultat d'un envoi (énumération serveur `NotificationStatus`). « Non
 *  envoyé » est un choix (collaborateur sans adresse), pas une panne. */
export const NOTIFICATION_STATUS_LABELS: Readonly<Record<NotificationStatus, string>> = {
  sent: 'Envoyé',
  failed: "Échec de l'envoi",
  bounced: 'Non distribué',
  skipped: 'Non envoyé',
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
export const bonSubStatusLabel = (subStatus: string): string => labelOrKey(BON_SUB_STATUS_LABELS, subStatus);
export const roleLabel = (role: string): string => labelOrKey(ROLE_LABELS, role);
export const categoryLabel = (category: string): string => labelOrKey(CATEGORY_LABELS, category);
export const notificationTypeLabel = (type: string): string => labelOrKey(NOTIFICATION_TYPE_LABELS, type);
