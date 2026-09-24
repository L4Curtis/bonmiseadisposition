export interface Variable { name: string; description: string }

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'signature' | 'contestation' | 'rappel' | 'depart';
  recipient: string;
  headerColor: string;
  variables: Variable[];
  isCustomized: boolean;
}

export interface TemplateHtml {
  html: string;
  defaultHtml: string;
  isCustomized: boolean;
  variables: Variable[];
}

export const CATEGORY_COLORS: Record<string, string> = {
  signature: 'bg-primary',
  contestation: 'bg-destructive',
  rappel: 'bg-warning',
  depart: 'bg-warning',
};

export const CATEGORY_LABELS: Record<string, string> = {
  signature: 'Signature',
  contestation: 'Contestation',
  rappel: 'Rappel',
  depart: 'Départ',
};

/** Bon proposé par la recherche de l'aperçu avec un bon réel (lot H3). */
export interface PreviewBonOption {
  id: string;
  reference: string;
  status: string;
  collaborateurName: string | null;
  filialeName: string | null;
}

/** Rendu d'un modèle avec les données d'un bon (lien de signature factice). */
export interface BonPreviewResult {
  html: string;
  subject: string;
  reference: string;
  /** Variables du modèle que le bon ne renseigne pas (valeurs d'exemple). */
  sampleVariables: string[];
}

/** Catégories de modèles qui ne portent pas sur un bon (pas d'aperçu avec un bon réel). */
export const NON_BON_CATEGORIES: ReadonlyArray<TemplateDefinition['category']> = ['depart'];
