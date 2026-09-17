import {
  FileText, Palette, Type, RulerIcon, LayoutTemplate,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PdfTemplateVariable {
  name: string;
  description: string;
}

export interface PdfTemplateDefinition {
  id: string;
  name: string;
  description: string;
  documentType: string;
  variables: PdfTemplateVariable[];
  isCustomized: boolean;
}

export interface PdfTemplateConfig {
  colors: Record<string, string>;
  fonts: Record<string, number>;
  margins: Record<string, number>;
  header: Record<string, unknown>;
  infoBoxes: Record<string, unknown>;
  table: Record<string, unknown>;
  signatures: Record<string, unknown>;
  footer: Record<string, unknown>;
}

// ─── Section config for the editor ───────────────────────────────────────────

export type SectionIcon = typeof Palette;

export interface FieldDef {
  key: string;
  label: string;
  type: 'color' | 'number' | 'text' | 'boolean';
  min?: number;
  max?: number;
}

export const SECTIONS: { key: string; label: string; icon: SectionIcon; fields: FieldDef[] }[] = [
  {
    key: 'colors', label: 'Couleurs', icon: Palette,
    fields: [
      { key: 'primary', label: 'Couleur principale', type: 'color' },
      { key: 'dark', label: 'Texte principal', type: 'color' },
      { key: 'gray', label: 'Labels / secondaire', type: 'color' },
      { key: 'lightGray', label: 'Tertiaire', type: 'color' },
      { key: 'border', label: 'Bordures', type: 'color' },
      { key: 'headerBg', label: 'En-tete tableau', type: 'color' },
      { key: 'rowAlt', label: 'Ligne alternee', type: 'color' },
    ],
  },
  {
    key: 'fonts', label: 'Polices (taille)', icon: Type,
    fields: [
      { key: 'titleSize', label: 'Titre', type: 'number', min: 5, max: 24 },
      { key: 'subtitleSize', label: 'Sous-titre', type: 'number', min: 5, max: 24 },
      { key: 'bodySize', label: 'Corps', type: 'number', min: 5, max: 24 },
      { key: 'labelSize', label: 'Labels', type: 'number', min: 5, max: 24 },
      { key: 'tableHeaderSize', label: 'En-tete tableau', type: 'number', min: 5, max: 24 },
      { key: 'tableBodySize', label: 'Corps tableau', type: 'number', min: 5, max: 24 },
    ],
  },
  {
    key: 'margins', label: 'Marges (px)', icon: RulerIcon,
    fields: [
      { key: 'top', label: 'Haut', type: 'number', min: 10, max: 150 },
      { key: 'bottom', label: 'Bas', type: 'number', min: 10, max: 150 },
      { key: 'left', label: 'Gauche', type: 'number', min: 10, max: 150 },
      { key: 'right', label: 'Droite', type: 'number', min: 10, max: 150 },
    ],
  },
  {
    key: 'header', label: 'En-tete du document', icon: LayoutTemplate,
    fields: [
      { key: 'showLogo', label: 'Afficher le logo', type: 'boolean' },
      { key: 'logoMaxHeight', label: 'Hauteur max logo', type: 'number', min: 10, max: 200 },
      { key: 'logoMaxWidth', label: 'Largeur max logo', type: 'number', min: 30, max: 300 },
      { key: 'titleText', label: 'Titre du document', type: 'text' },
      { key: 'subtitleText', label: 'Sous-titre', type: 'text' },
      { key: 'showReference', label: 'Afficher la reference', type: 'boolean' },
      { key: 'showDates', label: 'Afficher les dates', type: 'boolean' },
    ],
  },
  {
    key: 'infoBoxes', label: 'Encadres d\'information', icon: LayoutTemplate,
    fields: [
      { key: 'showCollaborateur', label: 'Afficher collaborateur', type: 'boolean' },
      { key: 'showEntite', label: 'Afficher entite', type: 'boolean' },
      { key: 'collaborateurTitle', label: 'Titre encadre collaborateur', type: 'text' },
      { key: 'entiteTitle', label: 'Titre encadre entite', type: 'text' },
    ],
  },
  {
    key: 'table', label: 'Tableau des equipements', icon: LayoutTemplate,
    fields: [
      { key: 'sectionTitle', label: 'Titre de section', type: 'text' },
      { key: 'showRowNumbers', label: 'Numeros de ligne', type: 'boolean' },
      { key: 'emptyMessage', label: 'Message si vide', type: 'text' },
    ],
  },
  {
    key: 'signatures', label: 'Signatures', icon: FileText,
    fields: [
      { key: 'showSignatures', label: 'Afficher les signatures', type: 'boolean' },
      { key: 'itTitle', label: 'Titre IT', type: 'text' },
      { key: 'itMention', label: 'Mention legale IT', type: 'text' },
      { key: 'collabTitle', label: 'Titre collaborateur', type: 'text' },
      { key: 'collabMention', label: 'Mention legale collaborateur', type: 'text' },
    ],
  },
  {
    key: 'footer', label: 'Pied de page', icon: FileText,
    fields: [
      { key: 'showFooter', label: 'Afficher le pied de page', type: 'boolean' },
      { key: 'footerText', label: 'Texte du pied de page', type: 'text' },
    ],
  },
];

export const DOC_TYPE_COLORS: Record<string, string> = {
  mise_disposition: 'bg-blue-500',
  restitution: 'bg-violet-500',
  cloture: 'bg-red-500',
  avenant: 'bg-emerald-500',
};
