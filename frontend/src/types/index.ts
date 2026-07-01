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
  isLocalAccount: boolean;
  mustChangePassword: boolean;
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
  address?: string | null;
  siret?: string | null;
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
  sent_restitution: 'En attente de restitution',
  partially_returned: 'Restitution partielle',
  archived: 'Archivé',
  cancelled: 'Annulé',
  contested: 'Contesté',
};

// Statuts (direction 2b) : point + texte coloré, sans fond ni anneau. La puce
// est rendue par StatusBadge avec bg-current ; ici on ne fournit que la couleur
// de texte (teintes -600 en clair / -400 en sombre).
export const BON_STATUS_COLORS: Record<BonStatus, string> = {
  draft:              'text-zinc-500 dark:text-zinc-400',
  sent_mise_dispo:    'text-amber-600 dark:text-amber-400',
  active:             'text-emerald-600 dark:text-emerald-400',
  sent_restitution:   'text-amber-600 dark:text-amber-400',
  partially_returned: 'text-blue-600 dark:text-blue-400',
  archived:           'text-violet-600 dark:text-violet-400',
  cancelled:          'text-zinc-400 dark:text-zinc-500',
  contested:          'text-red-600 dark:text-red-400',
};
