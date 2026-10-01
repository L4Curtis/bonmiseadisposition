import { AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  confirmLabel, countLabel, exceedsLimit, filtersLabel, limitWarning,
  type ExportFilter, type ExportItemLabel,
} from './export-summary';

/** Nombre de lignes à exporter : connu, en cours de calcul, ou sans objet
 *  (un export d'indicateurs n'a pas de « lignes » à annoncer). */
export type ExportCount =
  | { readonly status: 'known'; readonly value: number }
  | { readonly status: 'loading' }
  | { readonly status: 'unknown' }
  | { readonly status: 'none' };

export interface ExportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly count: ExportCount;
  readonly limit?: number;
  readonly filters: readonly ExportFilter[];
  readonly itemLabel: ExportItemLabel;
  /** Précision sur le contenu du fichier (« une ligne par équipement… »). */
  readonly note?: string;
  readonly downloading: boolean;
  readonly onConfirm: () => void;
}

const TOUCH = 'min-h-11 sm:min-h-9';

function CountSentence({ count, itemLabel }: Pick<ExportDialogProps, 'count' | 'itemLabel'>) {
  if (count.status === 'none') return null;
  if (count.status === 'loading') return <p className="text-sm text-muted-foreground" role="status">Calcul du nombre de lignes…</p>;
  if (count.status === 'unknown') {
    return <p className="text-sm text-muted-foreground">Nombre de lignes inconnu : le fichier reprendra les filtres ci-dessous.</p>;
  }
  return (
    <p className="text-sm text-foreground">
      <span className="font-semibold">{countLabel(count.value, itemLabel)}</span> à exporter.
    </p>
  );
}

/**
 * Confirmation d'un export CSV : ce que contiendra le fichier (« N lignes,
 * filtres : … ») et, au-delà du plafond du serveur, l'avertissement que le
 * fichier sera coupé. Rien n'est téléchargé sans cette confirmation.
 */
export function ExportDialog({
  open, onOpenChange, title, count, limit, filters, itemLabel, note, downloading, onConfirm,
}: ExportDialogProps) {
  const known = count.status === 'known' ? count.value : null;
  const tooMany = exceedsLimit(known, limit);
  const empty = known === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-4 p-4 sm:p-6">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          <DialogDescription>Fichier CSV, lisible dans Excel.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <CountSentence count={count} itemLabel={itemLabel} />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">Filtres : </span>
            {filtersLabel(filters)}
          </p>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>

        {tooMany && known !== null && limit !== undefined && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-foreground/90">{limitWarning(known, limit, itemLabel)}</p>
          </div>
        )}
        {empty && <p className="text-sm text-muted-foreground">Aucune ligne ne correspond aux filtres : rien à exporter.</p>}

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" className={TOUCH} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            className={TOUCH}
            onClick={onConfirm}
            disabled={downloading || empty || count.status === 'loading'}
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {downloading ? 'Export en cours…' : confirmLabel(known, limit)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
