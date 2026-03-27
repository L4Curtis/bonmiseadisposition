import { BonForPdf } from './pdf.service';

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

export const PDF_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  FILIALE: 'Nom de la filiale',
  REFERENCE: 'Référence du bon (ex: BMD-2026-0042)',
  DATE: 'Date de génération (jj/mm/aaaa)',
  TIME: 'Heure de génération (hh:mm)',
  COLLAB_NAME: 'Nom complet du collaborateur',
  STATUS: 'Statut du bon',
};

const vars = (...names: string[]): PdfTemplateVariable[] =>
  names.map((n) => ({ name: n, description: PDF_VARIABLE_DESCRIPTIONS[n] ?? n }));

const COMMON_VARS = vars('FILIALE', 'REFERENCE', 'DATE', 'TIME', 'COLLAB_NAME', 'STATUS');

export const PDF_TEMPLATE_DEFINITIONS: PdfTemplateDefinition[] = [
  {
    id: 'mise_disposition',
    name: 'Bon de mise à disposition',
    description: 'Modèle PDF pour les bons de mise à disposition de matériel',
    documentType: 'mise_disposition',
    variables: COMMON_VARS,
  },
  {
    id: 'restitution',
    name: 'Bon de restitution',
    description: 'Modèle PDF pour les bons de restitution de matériel',
    documentType: 'restitution',
    variables: COMMON_VARS,
  },
  {
    id: 'cloture',
    name: 'PV d\'équipements non restitués',
    description: 'Modèle PDF pour les procès-verbaux de clôture (équipements non rendus)',
    documentType: 'cloture',
    variables: COMMON_VARS,
  },
  {
    id: 'avenant',
    name: 'Avenant — Équipement(s) retrouvé(s)',
    description: 'Modèle PDF pour les avenants suite à récupération d\'équipements',
    documentType: 'avenant',
    variables: COMMON_VARS,
  },
];

// ─── Default colors (extracted from current hardcoded constants) ─────────────

const DEFAULT_COLORS: PdfColorScheme = {
  primary: '#2563eb',
  dark: '#1e293b',
  gray: '#64748b',
  lightGray: '#94a3b8',
  border: '#e2e8f0',
  headerBg: '#2563eb',
  rowAlt: '#f8fafc',
};

const DEFAULT_FONTS: PdfFontsConfig = {
  titleSize: 14,
  subtitleSize: 8,
  bodySize: 8,
  labelSize: 7,
  tableHeaderSize: 7,
  tableBodySize: 8,
};

const DEFAULT_MARGINS: PdfMarginsConfig = {
  top: 50,
  bottom: 50,
  left: 50,
  right: 50,
};

// ─── Default configs per document type ───────────────────────────────────────

export const DEFAULT_CONFIGS: Record<string, PdfTemplateConfig> = {
  mise_disposition: {
    colors: { ...DEFAULT_COLORS },
    fonts: { ...DEFAULT_FONTS },
    margins: { ...DEFAULT_MARGINS },
    header: {
      showLogo: true,
      logoMaxHeight: 40,
      logoMaxWidth: 120,
      titleText: 'BON DE MISE À DISPOSITION',
      subtitleText: 'Équipements informatiques — {{FILIALE}}',
      showReference: true,
      showDates: true,
    },
    infoBoxes: {
      showCollaborateur: true,
      showEntite: true,
      collaborateurTitle: 'COLLABORATEUR',
      entiteTitle: 'ENTITÉ / FILIALE',
    },
    table: {
      sectionTitle: 'ÉQUIPEMENTS MIS À DISPOSITION',
      showRowNumbers: true,
      emptyMessage: 'Aucun équipement enregistré',
    },
    signatures: {
      showSignatures: true,
      itTitle: 'SERVICE INFORMATIQUE',
      itMention: 'Je certifie avoir remis les équipements ci-dessus en bon état de fonctionnement',
      collabTitle: 'COLLABORATEUR',
      collabMention: 'Lu et approuvé — Je reconnais avoir reçu les équipements listés ci-dessus en bon état',
    },
    footer: {
      showFooter: true,
      footerText: 'Document généré le {{DATE}} à {{TIME}} — {{FILIALE}} — Réf. {{REFERENCE}}',
    },
  },

  restitution: {
    colors: { ...DEFAULT_COLORS },
    fonts: { ...DEFAULT_FONTS },
    margins: { ...DEFAULT_MARGINS },
    header: {
      showLogo: true,
      logoMaxHeight: 40,
      logoMaxWidth: 120,
      titleText: 'BON DE RESTITUTION',
      subtitleText: 'Restitution des équipements — {{FILIALE}}',
      showReference: true,
      showDates: true,
    },
    infoBoxes: {
      showCollaborateur: true,
      showEntite: true,
      collaborateurTitle: 'COLLABORATEUR',
      entiteTitle: 'ENTITÉ / FILIALE',
    },
    table: {
      sectionTitle: 'ÉQUIPEMENTS MIS À DISPOSITION',
      showRowNumbers: true,
      emptyMessage: 'Aucun équipement enregistré',
    },
    signatures: {
      showSignatures: true,
      itTitle: 'SERVICE INFORMATIQUE',
      itMention: 'Je certifie avoir remis les équipements ci-dessus en bon état de fonctionnement',
      collabTitle: 'COLLABORATEUR',
      collabMention: 'Lu et approuvé — Je reconnais avoir reçu les équipements listés ci-dessus en bon état',
    },
    footer: {
      showFooter: true,
      footerText: 'Document généré le {{DATE}} à {{TIME}} — {{FILIALE}} — Réf. {{REFERENCE}}',
    },
  },

  cloture: {
    colors: { ...DEFAULT_COLORS },
    fonts: { ...DEFAULT_FONTS },
    margins: { ...DEFAULT_MARGINS },
    header: {
      showLogo: true,
      logoMaxHeight: 40,
      logoMaxWidth: 120,
      titleText: 'PROCÈS-VERBAL D\'ÉQUIPEMENTS NON RESTITUÉS',
      subtitleText: 'Équipements non rendus — {{FILIALE}}',
      showReference: true,
      showDates: true,
    },
    infoBoxes: {
      showCollaborateur: true,
      showEntite: true,
      collaborateurTitle: 'COLLABORATEUR',
      entiteTitle: 'ENTITÉ / FILIALE',
    },
    table: {
      sectionTitle: 'ÉQUIPEMENTS MIS À DISPOSITION',
      showRowNumbers: true,
      emptyMessage: 'Aucun équipement enregistré',
    },
    signatures: {
      showSignatures: true,
      itTitle: 'SERVICE INFORMATIQUE',
      itMention: 'Je certifie avoir remis les équipements ci-dessus en bon état de fonctionnement',
      collabTitle: 'COLLABORATEUR',
      collabMention: 'Lu et approuvé — Je reconnais avoir reçu les équipements listés ci-dessus en bon état',
    },
    footer: {
      showFooter: true,
      footerText: 'Document généré le {{DATE}} à {{TIME}} — {{FILIALE}} — Réf. {{REFERENCE}}',
    },
  },

  avenant: {
    colors: { ...DEFAULT_COLORS },
    fonts: { ...DEFAULT_FONTS },
    margins: { ...DEFAULT_MARGINS },
    header: {
      showLogo: true,
      logoMaxHeight: 40,
      logoMaxWidth: 120,
      titleText: 'AVENANT — ÉQUIPEMENT(S) RETROUVÉ(S)',
      subtitleText: 'Mise à jour du PV de clôture — {{FILIALE}}',
      showReference: true,
      showDates: true,
    },
    infoBoxes: {
      showCollaborateur: true,
      showEntite: true,
      collaborateurTitle: 'COLLABORATEUR',
      entiteTitle: 'ENTITÉ / FILIALE',
    },
    table: {
      sectionTitle: 'ÉQUIPEMENTS RETROUVÉS',
      showRowNumbers: true,
      emptyMessage: 'Aucun équipement enregistré',
    },
    signatures: {
      showSignatures: true,
      itTitle: 'SERVICE INFORMATIQUE — ATTESTATION',
      itMention: 'Je certifie que le(s) équipement(s) listé(s) ci-dessus ont été retrouvés et récupérés à la date indiquée.',
      collabTitle: 'COLLABORATEUR',
      collabMention: 'Lu et approuvé — Je reconnais avoir reçu les équipements listés ci-dessus en bon état',
    },
    footer: {
      showFooter: true,
      footerText: 'Document généré le {{DATE}} à {{TIME}} — {{FILIALE}} — Réf. {{REFERENCE}}',
    },
  },
};

// ─── Deep merge utility ──────────────────────────────────────────────────────

/** Deep-merge a partial config over a base config. Only known keys are merged. */
export function deepMergeConfig(
  base: PdfTemplateConfig,
  override: Partial<Record<string, unknown>>,
): PdfTemplateConfig {
  const result = structuredClone(base);

  const sections = ['colors', 'fonts', 'margins', 'header', 'infoBoxes', 'table', 'signatures', 'footer'] as const;
  for (const section of sections) {
    const overrideSection = override[section];
    if (overrideSection && typeof overrideSection === 'object' && !Array.isArray(overrideSection)) {
      const baseSection = result[section] as unknown as Record<string, unknown>;
      const src = overrideSection as Record<string, unknown>;
      for (const key of Object.keys(baseSection)) {
        if (key in src && src[key] !== undefined) {
          baseSection[key] = src[key];
        }
      }
    }
  }

  return result;
}

// ─── Variable substitution ───────────────────────────────────────────────────

/** Replace {{VARIABLE}} placeholders in a text string. */
export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

// ─── Preview data ────────────────────────────────────────────────────────────

export const PREVIEW_BON: BonForPdf = {
  id: 'preview-bon-001',
  reference: 'BMD-2026-0042',
  civilite: 'mme',
  status: 'active',
  dateMiseDisposition: new Date('2026-03-15'),
  dateRestitution: null,
  notes: 'Ceci est un aperçu avec des données fictives. Les remarques générales apparaissent ici.',
  filiale: {
    displayName: 'Groupe Livio — Siège',
    name: 'Livio',
    logoPath: null,
    address: '123 Avenue de la République, 75011 Paris',
    siret: '123 456 789 00012',
  },
  collaborateur: {
    displayName: 'Marie Dupont',
    department: 'Direction Financière',
  },
  collaborateurEmail: 'marie.dupont@livio.fr',
  createdBy: {
    displayName: 'Jean Martin',
  },
  equipments: [
    {
      id: 'eq-001',
      catalogItem: { brand: 'Dell', model: 'Latitude 5540' },
      serialNumber: 'SN-2026-001234',
      inventoryNumber: 'INV-LAP-0042',
      notes: 'Avec sacoche',
      returnedAt: null,
      notReturned: false,
      notReturnedReason: null,
    },
    {
      id: 'eq-002',
      catalogItem: { brand: 'Dell', model: 'U2723QE 27"' },
      serialNumber: 'SN-2026-005678',
      inventoryNumber: 'INV-ECR-0108',
      notes: null,
      returnedAt: null,
      notReturned: false,
      notReturnedReason: null,
    },
    {
      id: 'eq-003',
      catalogItem: { brand: 'Logitech', model: 'MX Master 3S' },
      serialNumber: null,
      inventoryNumber: 'INV-SOU-0215',
      notes: null,
      returnedAt: null,
      notReturned: false,
      notReturnedReason: null,
    },
  ],
  signatures: [],
};
