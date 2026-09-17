export interface Variable { name: string; description: string }

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'signature' | 'contestation' | 'rappel';
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
  signature: 'bg-blue-500',
  contestation: 'bg-red-500',
  rappel: 'bg-orange-500',
};

export const CATEGORY_LABELS: Record<string, string> = {
  signature: 'Signature',
  contestation: 'Contestation',
  rappel: 'Rappel',
};
