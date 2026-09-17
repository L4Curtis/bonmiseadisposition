export const STATUS_LABELS: Record<string, string> = {
  open: 'Ouverte',
  in_review: 'En cours d\'examen',
  resolved: 'Résolue',
  rejected: 'Rejetée',
};

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  in_review: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  resolved: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  rejected: 'bg-muted text-muted-foreground',
};

export const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouverte' },
  { value: 'in_review', label: 'En cours d\'examen' },
  { value: 'resolved', label: 'Résolue' },
  { value: 'rejected', label: 'Rejetée' },
];
