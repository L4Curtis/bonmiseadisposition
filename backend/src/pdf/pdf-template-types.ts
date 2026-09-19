// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PdfColorScheme {
  primary: string;
  dark: string;
  gray: string;
  lightGray: string;
  border: string;
  headerBg: string;
  rowAlt: string;
}

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

// ─── Template definition metadata ────────────────────────────────────────────

export interface PdfTemplateVariable {
  name: string;
  description: string;
}

export interface PdfTemplateDefinition {
  id: string;
  name: string;
  description: string;
  documentType: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant';
  variables: PdfTemplateVariable[];
}
