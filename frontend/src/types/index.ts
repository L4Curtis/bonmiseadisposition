export type UserRole = 'admin' | 'technician' | 'collaborator';

export interface User {
  id: string;
  samAccountName: string;
  displayName: string;
  email: string;
  department?: string;
  company?: string;
  title?: string;
  filialeId?: string;
  isItStaff: boolean;
  role: UserRole;
  active: boolean;
  filiale?: Filiale;
}

export interface Filiale {
  id: string;
  name: string;
  displayName: string;
  logoPath?: string;
  stampPath?: string;
  active: boolean;
}

export type BonStatus =
  | 'draft'
  | 'sent_mise_dispo'
  | 'active'
  | 'sent_restitution'
  | 'partially_returned'
  | 'archived'
  | 'cancelled'
  | 'contested';

export const BON_STATUS_LABELS: Record<BonStatus, string> = {
  draft: 'Brouillon',
  sent_mise_dispo: 'En attente de signature',
  active: 'Actif',
  sent_restitution: 'Restitution en attente',
  partially_returned: 'Restitution partielle',
  archived: 'Archivé',
  cancelled: 'Annulé',
  contested: 'Contesté',
};

export const BON_STATUS_COLORS: Record<BonStatus, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  sent_mise_dispo: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  active: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  sent_restitution: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  partially_returned: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
  archived: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500',
  contested: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400',
};
