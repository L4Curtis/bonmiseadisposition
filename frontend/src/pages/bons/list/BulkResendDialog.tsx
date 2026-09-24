import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BulkResendProgress, BulkResendReport, ResendItemResult } from './useResendLinks';

export interface BulkResendDialogProps {
  /** Toute la sélection (références affichées dans le compte rendu). */
  readonly selected: ReadonlyArray<{ id: string; reference: string }>;
  /** Bons de la sélection dont le lien sera relancé. */
  readonly eligibleCount: number;
  readonly progress: BulkResendProgress | null;
  readonly report: BulkResendReport | null;
  readonly onConfirm: (force: boolean) => void;
  readonly onClose: () => void;
}

function ResultList({ title, items, references }: {
  readonly title: string;
  readonly items: readonly ResendItemResult[];
  readonly references: ReadonlyMap<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ul className="mt-1 max-h-40 overflow-auto space-y-0.5 text-xs text-muted-foreground">
        {items.map((r) => (
          <li key={r.id}>
            <span className="font-mono text-foreground/80">{references.get(r.id) ?? r.id}</span>
            {r.reason ? ` — ${r.reason}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Relance groupée en trois temps dans la même boîte de dialogue :
 *  confirmation, progression (lots successifs), compte rendu envoyés /
 *  ignorés / en échec. */
export function BulkResendDialog({ selected, eligibleCount, progress, report, onConfirm, onClose }: BulkResendDialogProps) {
  const [force, setForce] = useState(false);
  const running = progress !== null;
  const references = new Map(selected.map((t) => [t.id, t.reference]));
  const count = eligibleCount;
  const ineligibleCount = selected.length - eligibleCount;
  const plural = count > 1 ? 's' : '';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !running) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Relancer les liens de signature</DialogTitle>
          <DialogDescription>
            {report
              ? 'Relance terminée.'
              : `Un nouveau lien sera envoyé par email pour ${count} bon${plural}, comme avec « Renvoyer le lien » sur la fiche.`}
          </DialogDescription>
        </DialogHeader>

        {!report && !running && (
          <div className="space-y-3 text-sm">
            {ineligibleCount > 0 && (
              <p className="text-muted-foreground">
                {ineligibleCount} bon{ineligibleCount > 1 ? 's' : ''} de la sélection
                {ineligibleCount > 1 ? ' ne sont' : ' n’est'} pas en attente de signature par email et
                {ineligibleCount > 1 ? ' seront ignorés' : ' sera ignoré'}.
              </p>
            )}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              <span>
                Relancer aussi les bons dont le lien a été envoyé il y a moins d’une heure
                <span className="block text-xs text-muted-foreground">
                  Sinon ils sont ignorés : le collaborateur vient peut-être de le recevoir.
                </span>
              </span>
            </label>
          </div>
        )}

        {running && progress && (
          <div className="space-y-2">
            <div
              role="progressbar"
              aria-label="Progression de la relance"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-[hsl(var(--primary))] transition-[width] motion-reduce:transition-none"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {progress.done} / {progress.total} traité{progress.total > 1 ? 's' : ''}…
            </p>
          </div>
        )}

        {report && (
          <div className="space-y-3" aria-live="polite">
            <p className="text-sm">
              <strong>{report.sent.length}</strong> envoyé{report.sent.length > 1 ? 's' : ''},{' '}
              <strong>{report.skipped.length}</strong> ignoré{report.skipped.length > 1 ? 's' : ''},{' '}
              <strong>{report.failed.length}</strong> en échec.
            </p>
            <ResultList title="Ignorés" items={report.skipped} references={references} />
            <ResultList title="En échec" items={report.failed} references={references} />
          </div>
        )}

        <DialogFooter>
          {report ? (
            <Button size="sm" onClick={onClose}>Fermer</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose} disabled={running}>
                Annuler
              </Button>
              <Button size="sm" onClick={() => onConfirm(force)} disabled={running || count === 0}>
                {running ? 'Relance en cours…' : `Relancer ${count} lien${plural}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
