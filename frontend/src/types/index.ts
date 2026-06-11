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

// Badges « 2026 » : fond translucide + anneau inset + texte coloré (la puce
// est rendue par StatusBadge avec bg-current)
export const BON_STATUS_COLORS: Record<BonStatus, string> = {
  draft: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/20',
  sent_mise_dispo: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/25',
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/25',
  sent_restitution: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/25',
  partially_returned: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 ring-1 ring-inset ring-yellow-500/25',
  archived: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-400 dark:text-zinc-500 ring-1 ring-inset ring-zinc-500/15',
  contested: 'bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/25',
};
