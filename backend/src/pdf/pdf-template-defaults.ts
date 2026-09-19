import { PdfColorScheme, PdfFontsConfig, PdfMarginsConfig, PdfTemplateConfig } from './pdf-template-types';

// ─── Default colors — palette de marque « Livio 2026 » (alignée sur l'app) ───
// Rouge Livio en accent, neutres béton chauds, filets nets. Ne s'applique
// qu'aux modèles NON personnalisés par l'admin.

const DEFAULT_COLORS: PdfColorScheme = {
  primary: '#D8372B',   // rouge Livio (accent de marque)
  dark: '#1B1A18',      // texte principal
  gray: '#6B665E',      // texte secondaire
  lightGray: '#A79F94', // texte atténué / placeholders
  border: '#E2DFD9',    // filet net
  headerBg: '#D8372B',  // bandeau de tableau (rouge, texte blanc)
  rowAlt: '#F6F3EE',    // fond des boîtes / lignes alternées (béton clair)
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
      footerText: 'Document signé électroniquement — {{FILIALE}} — Réf. {{REFERENCE}}',
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
      sectionTitle: 'ÉQUIPEMENTS RESTITUÉS',
      showRowNumbers: true,
      emptyMessage: 'Aucun équipement enregistré',
    },
    signatures: {
      showSignatures: true,
      itTitle: 'SERVICE INFORMATIQUE',
      itMention: 'Je certifie avoir repris les équipements ci-dessus dans l’état indiqué',
      collabTitle: 'COLLABORATEUR',
      collabMention: 'Lu et approuvé — Je reconnais avoir restitué les équipements listés ci-dessus',
    },
    footer: {
      showFooter: true,
      footerText: 'Document signé électroniquement — {{FILIALE}} — Réf. {{REFERENCE}}',
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
      sectionTitle: 'ÉQUIPEMENTS — ÉTAT AU PROCÈS-VERBAL',
      showRowNumbers: true,
      emptyMessage: 'Aucun équipement enregistré',
    },
    signatures: {
      showSignatures: true,
      itTitle: 'SERVICE INFORMATIQUE',
      itMention: 'Je certifie l’état des équipements ci-dessus (rendus / non rendus) à la date du présent procès-verbal',
      collabTitle: 'COLLABORATEUR',
      collabMention: 'Lu et approuvé — Je reconnais l’état des équipements listés ci-dessus, dont ceux déclarés non rendus',
    },
    footer: {
      showFooter: true,
      footerText: 'Document signé électroniquement — {{FILIALE}} — Réf. {{REFERENCE}}',
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
      collabMention: 'Lu et approuvé — Je reconnais que le(s) équipement(s) listé(s) ci-dessus ont été restitués',
    },
    footer: {
      showFooter: true,
      footerText: 'Document signé électroniquement — {{FILIALE}} — Réf. {{REFERENCE}}',
    },
  },
};
