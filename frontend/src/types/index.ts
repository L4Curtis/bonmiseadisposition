export type UserRole = 'admin' | 'technician' | 'direction' | 'collaborator';

export interface User {
  id: string;
  samAccountName: string;
  displayName: string;
  /** `null` pour un collaborateur créé manuellement sans adresse email
   *  (compagnon de chantier sans compte Active Directory) : il ne peut alors
   *  recevoir aucun lien et signe ses bons en présentiel. */
  email: string | null;
  /** `null` en base (colonne `department String?`) — jamais garanti renseigné,
   *  y compris pour un compte manuel dont le service n'a pas été précisé. */
  department?: string | null;
  company?: string;
  title?: string;
  filialeId?: string;
  isItStaff: boolean;
  isLocalAccount: boolean;
  /** Compte créé à la main par un administrateur (sans compte Active
   *  Directory), par opposition à un compte synchronisé depuis l'annuaire. */
  isManualAccount: boolean;
  mustChangePassword: boolean;
  role: UserRole;
  active: boolean;
  filiale?: Filiale;
  /** Renseignés uniquement pour un compte manuel — permettent de préremplir
   *  le formulaire de modification (à défaut, on retombe sur displayName). */
  firstName?: string;
  lastName?: string;
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
  // Jetons du thème : attente et vigilance en `warning`, bon vivant en
  // `success`, litige en `destructive`, étapes intermédiaires en `primary`,
  // états clos ou inactifs en neutre.
  draft:              'text-muted-foreground',
  sent_mise_dispo:    'text-warning',
  active:             'text-success',
  sent_restitution:   'text-warning',
  partially_returned: 'text-primary',
  archived:           'text-muted-foreground',
  cancelled:          'text-muted-foreground/70',
  contested:          'text-destructive',
};
