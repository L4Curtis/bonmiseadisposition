// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/templates.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — modèles d'email et modèles PDF modifiables depuis
 * l'administration.
 *
 * Contrôleurs : `admin/templates.controller.ts` et
 * `templates/template-bon-preview.controller.ts` (préfixe
 * `/api/admin/email-templates`), `admin/pdf-templates.controller.ts`
 * (préfixe `/api/admin/pdf-templates`). Toutes ces routes sont réservées à
 * l'administrateur.
 */

import type { BonStatus, IsoDateTime } from './common';

// ─── Briques partagées ────────────────────────────────────────────────────────

/** Variable utilisable dans un modèle (`{{NOM}}`) et sa description. */
export interface TemplateVariable {
  name: string;
  description: string;
}

/**
 * POST /api/admin/email-templates/import et POST /api/admin/pdf-templates/import
 * — nombre de modèles importés et ignorés (identifiant inconnu, contenu
 * invalide). Erreur 400 si le corps ne contient pas de tableau `templates`.
 */
export interface TemplatesImportResponse {
  imported: number;
  skipped: number;
}

/**
 * PATCH /api/admin/email-templates/:id, DELETE /api/admin/email-templates/:id,
 * PATCH /api/admin/pdf-templates/:id, DELETE /api/admin/pdf-templates/:id —
 * enregistrement ou retour au modèle par défaut réussi (un identifiant inconnu
 * répond 404).
 */
export interface TemplateSuccessResponse {
  success: true;
}

// ─── Modèles d'email ──────────────────────────────────────────────────────────

/** Identifiants des modèles d'email (catalogue fixe, templates/template-catalog.ts). */
export type EmailTemplateId =
  | 'mise_disposition_request'
  | 'restitution_request'
  | 'confirmation_mise_disposition'
  | 'confirmation_restitution'
  | 'pv_cloture_request'
  | 'contestation_alert'
  | 'contestation_resolved'
  | 'contestation_rejected'
  | 'reminder'
  | 'confirmation_pv_cloture'
  | 'departure_alert'
  | 'restitution_due_reminder';

export type EmailTemplateCategory = 'signature' | 'contestation' | 'rappel' | 'depart';

/** Modèle d'email du catalogue. */
export interface EmailTemplateSummary {
  id: EmailTemplateId;
  name: string;
  description: string;
  category: EmailTemplateCategory;
  /** Destinataire en clair (« Collaborateur », « Staff IT »). */
  recipient: string;
  /** Couleur de la pastille affichée dans l'administration (code hexadécimal). */
  headerColor: string;
  variables: TemplateVariable[];
  /** Vrai quand une version personnalisée non vide est enregistrée. */
  isCustomized: boolean;
}

/** GET /api/admin/email-templates — catalogue complet, dans l'ordre du catalogue. */
export type EmailTemplatesResponse = EmailTemplateSummary[];

/** Modèle d'email exporté. */
export interface EmailTemplateExportItem {
  id: EmailTemplateId;
  name: string;
  /** HTML personnalisé s'il existe, sinon HTML par défaut. */
  html: string;
  isCustomized: boolean;
}

/** GET /api/admin/email-templates/export — tous les modèles, personnalisés ou non. */
export interface EmailTemplatesExportResponse {
  exportedAt: IsoDateTime;
  templates: EmailTemplateExportItem[];
}

/** GET /api/admin/email-templates/:id/html — HTML courant et HTML par défaut
 *  d'un modèle (404 si l'identifiant est inconnu). */
export interface EmailTemplateHtmlResponse {
  /** HTML personnalisé s'il existe, sinon HTML par défaut. */
  html: string;
  defaultHtml: string;
  /** Vrai quand `html` diffère de `defaultHtml` (comparaison du contenu). */
  isCustomized: boolean;
  variables: TemplateVariable[];
}

/** GET /api/admin/email-templates/:id/preview — HTML rendu avec les données d'exemple. */
export interface EmailTemplatePreviewResponse {
  html: string;
}

/** Envoi de test accepté par le serveur d'envoi. */
export interface EmailTemplateTestSuccess {
  success: true;
  /** « Email de test envoyé à … ». */
  message: string;
}

/** Envoi de test en échec (SMTP non configuré, serveur injoignable…). */
export interface EmailTemplateTestFailure {
  success: false;
  message: string;
}

/**
 * POST /api/admin/email-templates/:id/test et
 * POST /api/admin/email-templates/:id/test-bon — envoi d'un email de test,
 * avec les données d'exemple ou celles du bon `bonId`. Répond 201 dans les
 * deux branches ; 400 pour une adresse invalide (ou un `bonId` qui n'est pas
 * un UUID, un modèle sans bon, un bon anonymisé), 404 pour un modèle ou un
 * bon introuvable.
 */
export type EmailTemplateTestResponse = EmailTemplateTestSuccess | EmailTemplateTestFailure;

/** Bon proposé par la recherche de l'aperçu avec un bon réel. */
export interface PreviewBonOption {
  id: string;
  reference: string;
  status: BonStatus;
  /** Nom du collaborateur (relation obligatoire : jamais `null` en pratique). */
  collaborateurName: string | null;
  /** Nom affiché de la filiale, à défaut son nom court (jamais `null` en pratique). */
  filialeName: string | null;
}

/**
 * GET /api/admin/email-templates/preview-bons?q= — 10 bons au plus dont la
 * référence contient `q` (sans distinction de casse ; tous les bons si `q`
 * est vide), les plus récents d'abord, bons anonymisés exclus.
 */
export type PreviewBonsResponse = PreviewBonOption[];

/**
 * GET /api/admin/email-templates/:id/preview-bon/:bonId — modèle rendu avec
 * les données du bon, lien de signature factice. 400 pour un `bonId` qui
 * n'est pas un UUID, un modèle qui ne porte pas sur un bon (departure_alert)
 * ou un bon anonymisé ; 404 pour un modèle ou un bon introuvable.
 */
export interface EmailTemplateBonPreviewResponse {
  html: string;
  /** Objet de l'email tel qu'il serait envoyé pour ce bon. */
  subject: string;
  reference: string;
  /** Variables du modèle que le bon ne renseigne pas (remplacées par des
   *  valeurs d'exemple). */
  sampleVariables: string[];
}

// ─── Modèles PDF ──────────────────────────────────────────────────────────────

/** Identifiants des modèles PDF (catalogue fixe, pdf/pdf-template-definitions.ts). */
export type PdfTemplateId = 'mise_disposition' | 'restitution' | 'cloture' | 'avenant';

/** Type de document produit par un modèle PDF. */
export type PdfDocumentType = 'mise_disposition' | 'restitution' | 'cloture' | 'avenant';

/** Modèle PDF du catalogue. */
export interface PdfTemplateSummary {
  id: PdfTemplateId;
  name: string;
  description: string;
  documentType: PdfDocumentType;
  variables: TemplateVariable[];
  /** Vrai dès qu'une configuration est enregistrée pour ce modèle, même
   *  identique à la configuration par défaut (voir PdfTemplateConfigResponse). */
  isCustomized: boolean;
}

/** GET /api/admin/pdf-templates — catalogue complet, dans l'ordre du catalogue. */
export type PdfTemplatesResponse = PdfTemplateSummary[];

/** Couleurs du document (codes hexadécimaux « #RRGGBB »). */
export interface PdfColorScheme {
  primary: string;
  dark: string;
  gray: string;
  lightGray: string;
  border: string;
  headerBg: string;
  rowAlt: string;
}

/** Tailles de police, en points. */
export interface PdfFontsConfig {
  titleSize: number;
  subtitleSize: number;
  bodySize: number;
  labelSize: number;
  tableHeaderSize: number;
  tableBodySize: number;
}

export interface PdfMarginsConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PdfHeaderConfig {
  showLogo: boolean;
  logoMaxHeight: number;
  logoMaxWidth: number;
  titleText: string;
  subtitleText: string;
  showReference: boolean;
  showDates: boolean;
}

export interface PdfInfoBoxesConfig {
  showCollaborateur: boolean;
  showEntite: boolean;
  collaborateurTitle: string;
  entiteTitle: string;
}

export interface PdfTableConfig {
  sectionTitle: string;
  showRowNumbers: boolean;
  emptyMessage: string;
}

export interface PdfSignaturesConfig {
  showSignatures: boolean;
  itTitle: string;
  itMention: string;
  collabTitle: string;
  collabMention: string;
}

export interface PdfFooterConfig {
  showFooter: boolean;
  footerText: string;
}

/** Configuration complète d'un modèle PDF (personnalisation fusionnée sur la
 *  configuration par défaut : toutes les clés sont toujours présentes). */
export interface PdfTemplateConfig {
  colors: PdfColorScheme;
  fonts: PdfFontsConfig;
  margins: PdfMarginsConfig;
  header: PdfHeaderConfig;
  infoBoxes: PdfInfoBoxesConfig;
  table: PdfTableConfig;
  signatures: PdfSignaturesConfig;
  footer: PdfFooterConfig;
}

/** Modèle PDF exporté. */
export interface PdfTemplateExportItem {
  id: PdfTemplateId;
  name: string;
  config: PdfTemplateConfig;
  /** Vrai dès qu'une configuration est enregistrée pour ce modèle. */
  isCustomized: boolean;
}

/** GET /api/admin/pdf-templates/export — configuration de tous les modèles PDF. */
export interface PdfTemplatesExportResponse {
  exportedAt: IsoDateTime;
  templates: PdfTemplateExportItem[];
}

/** GET /api/admin/pdf-templates/:id/config — configuration courante et
 *  configuration par défaut d'un modèle (404 si l'identifiant est inconnu). */
export interface PdfTemplateConfigResponse {
  config: PdfTemplateConfig;
  defaultConfig: PdfTemplateConfig;
  /** Vrai quand `config` diffère de `defaultConfig` (comparaison du contenu,
   *  à la différence de `PdfTemplateSummary.isCustomized`). */
  isCustomized: boolean;
  variables: TemplateVariable[];
}
