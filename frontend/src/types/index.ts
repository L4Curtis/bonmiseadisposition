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
  | 'archived'
  | 'cancelled'
  | 'contested';

export const BON_STATUS_LABELS: Record<BonStatus, string> = {
  draft: 'Brouillon',
  sent_mise_dispo: 'En attente de signature',
  active: 'Actif',
  sent_restitution: 'Restitution en attente',
  archived: 'Archivé',
  cancelled: 'Annulé',
  contested: 'Contesté',
};

export const BON_STATUS_COLORS: Record<BonStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent_mise_dispo: 'bg-orange-100 text-orange-700',
  active: 'bg-green-100 text-green-700',
  sent_restitution: 'bg-orange-100 text-orange-700',
  archived: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-500',
  contested: 'bg-red-100 text-red-700',
};
