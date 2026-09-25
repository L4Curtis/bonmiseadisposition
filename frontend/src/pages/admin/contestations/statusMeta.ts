/** Libellés et options de statut : lexique commun (`@/domain/labels`). */
export {
  CONTESTATION_STATUS_LABELS as STATUS_LABELS,
  CONTESTATION_STATUS_OPTIONS as STATUS_OPTIONS,
} from '@/domain/labels';

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-destructive/10 text-destructive',
  in_review: 'bg-warning/10 text-warning',
  resolved: 'bg-success/10 text-success',
  rejected: 'bg-muted text-muted-foreground',
};
