import { PdfTemplateDefinition, PdfTemplateVariable } from './pdf-template-types';

// TIME et STATUS ont été retirés : TIME n'est jamais renseigné (chaîne vide,
// le rendu du PDF est déterministe et ne dépend d'aucune horloge murale) et
// STATUS n'est volontairement jamais imprimé (statut volatil — casserait le
// déterminisme de la preuve). Les documenter comme variables disponibles
// induisait les administrateurs en erreur.
export const PDF_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  FILIALE: 'Nom de la filiale',
  REFERENCE: 'Référence du bon (ex. BON-2026-0042)',
  DATE: 'Date de mise à disposition',
  COLLAB_NAME: 'Nom complet du collaborateur',
};

const vars = (...names: string[]): PdfTemplateVariable[] =>
  names.map((n) => ({ name: n, description: PDF_VARIABLE_DESCRIPTIONS[n] ?? n }));

const COMMON_VARS = vars('FILIALE', 'REFERENCE', 'DATE', 'COLLAB_NAME');

export const PDF_TEMPLATE_DEFINITIONS: PdfTemplateDefinition[] = [
  {
    id: 'mise_disposition',
    name: 'Bon de mise à disposition',
    description: 'Modèle PDF des bons de mise à disposition d’équipements',
    documentType: 'mise_disposition',
    variables: COMMON_VARS,
  },
  {
    id: 'restitution',
    name: 'Bon de restitution',
    description: 'Modèle PDF des bons de restitution d’équipements',
    documentType: 'restitution',
    variables: COMMON_VARS,
  },
  {
    id: 'cloture',
    name: 'PV de non-restitution',
    description: 'Modèle PDF du PV de non-restitution (équipements non restitués)',
    documentType: 'cloture',
    variables: COMMON_VARS,
  },
  {
    id: 'avenant',
    name: 'Avenant — Équipement(s) retrouvé(s)',
    description: 'Modèle PDF de l’avenant au PV de non-restitution, quand des équipements sont retrouvés',
    documentType: 'avenant',
    variables: COMMON_VARS,
  },
];
