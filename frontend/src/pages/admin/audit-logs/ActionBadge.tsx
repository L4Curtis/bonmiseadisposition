import type { AuditActionTone } from '@/contracts/audit-actions';

// Jetons du thème : action courante, réussite, vigilance, échec, technique.
const TONE_CLASSES: Readonly<Record<AuditActionTone, string>> = {
  action: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  failure: 'bg-destructive/10 text-destructive',
  technical: 'bg-muted text-muted-foreground',
};

/** Pastille d'une action : libellé et ton du catalogue. */
export function ActionBadge({ label, tone }: { label: string; tone: AuditActionTone }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
