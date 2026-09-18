export const STATUS_LABELS: Record<string, string> = {
  open: 'Ouverte',
  in_review: 'En cours d\'examen',
  resolved: 'Résolue',
  rejected: 'Rejetée',
};

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-destructive/10 text-destructive',
  in_review: 'bg-warning/10 text-warning',
  resolved: 'bg-success/10 text-success',
  rejected: 'bg-muted text-muted-foreground',
};

export const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouverte' },
  { value: 'in_review', label: 'En cours d\'examen' },
  { value: 'resolved', label: 'Résolue' },
  { value: 'rejected', label: 'Rejetée' },
];
