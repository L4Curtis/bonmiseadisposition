import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ExportDialog, type ExportCount } from './ExportDialog';
import { ExportTruncatedBanner } from './ExportTruncatedBanner';
import { DEFAULT_ITEM_LABEL, type ExportFilter, type ExportItemLabel } from './export-summary';
import { useExportDownload } from './use-export-download';

export interface ExportButtonProps {
  /** Chemin de l'export, filtres compris (`/reporting/inventory/export?…`). */
  readonly path: string;
  /** Nom du fichier si le serveur n'en annonce pas. */
  readonly fallbackFilename: string;
  /** Filtres actifs, en mots d'écran : repris dans l'annonce avant l'export. */
  readonly filters: readonly ExportFilter[];
  /**
   * Nombre de lignes du fichier, quand l'écran le connaît déjà (le `total`
   * de la liste affichée, avec les mêmes filtres). `null` : pas encore connu.
   */
  readonly count?: number | null;
  /**
   * Sinon, lecture du nombre à l'ouverture de la confirmation (route de
   * comptage, ou `total` d'une page de la liste avec les mêmes filtres).
   */
  readonly loadCount?: (signal: AbortSignal) => Promise<number>;
  /** Plafond de lignes du serveur (ex. `meta.exportLimit` de la liste). */
  readonly limit?: number;
  /** Nom des lignes (« équipement » / « équipements »). */
  readonly itemLabel?: ExportItemLabel;
  /** Texte du bouton (défaut « Exporter CSV »). */
  readonly label?: string;
  /** Titre de la confirmation (défaut « Exporter en CSV »). */
  readonly title?: string;
  /** Précision sur le contenu du fichier, affichée dans la confirmation. */
  readonly note?: string;
  /** Export sans lignes à compter (indicateurs) : l'annonce ne donne que les filtres. */
  readonly uncounted?: boolean;
  readonly disabled?: boolean;
  /** Message si l'export échoue sans message du serveur. */
  readonly errorMessage?: string;
  readonly className?: string;
  readonly buttonClassName?: string;
}

/**
 * Bouton d'export CSV commun à tous les écrans (bons, inventaire, journal
 * d'audit, historique d'un équipement, filiales, utilisateurs, indicateurs) :
 *  1. **avant** : une confirmation annonce « N lignes, filtres : … » et, au-delà
 *     du plafond du serveur, prévient que le fichier sera coupé ;
 *  2. **après** : si le serveur a coupé le fichier (`X-Truncated`), un bandeau
 *     reste affiché jusqu'à ce que l'utilisateur le ferme. Il est rendu juste
 *     après le bouton, en frère : dans un en-tête `flex flex-wrap`, il prend
 *     toute une ligne (`basis-full`) sous le titre.
 * Mode d'emploi : docs/frontend-guide.md, « Exports CSV ».
 */
export function ExportButton(props: ExportButtonProps) {
  const { path, fallbackFilename, filters, limit, itemLabel = DEFAULT_ITEM_LABEL, note, disabled, className } = props;
  const [open, setOpen] = useState(false);
  const { count, refresh, cancel } = useExportCount(props);
  const download = useExportDownload();
  const known = count.status === 'known' ? count.value : null;

  const openDialog = () => {
    refresh();
    setOpen(true);
  };
  const changeOpen = (next: boolean) => {
    if (!next) cancel();
    setOpen(next);
  };
  const confirm = async () => {
    const done = await download.run({
      path,
      fallbackFilename,
      errorMessage: props.errorMessage ?? "Erreur lors de l'export CSV.",
    });
    if (done) setOpen(false);
  };

  return (
    <>
      <div className={cn('flex flex-col items-stretch sm:items-end', className)}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('min-h-11 sm:min-h-8', props.buttonClassName)}
          onClick={openDialog}
          disabled={disabled || download.downloading}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {props.label ?? 'Exporter CSV'}
        </Button>
        <ExportDialog
          open={open}
          onOpenChange={changeOpen}
          title={props.title ?? 'Exporter en CSV'}
          count={count}
          limit={limit}
          filters={filters}
          itemLabel={itemLabel}
          note={note}
          downloading={download.downloading}
          onConfirm={() => void confirm()}
        />
      </div>
      {/* Frère du bouton, sur toute la largeur : dans un en-tête en flex-wrap,
          `basis-full` le place sur sa propre ligne, sous le titre et le bouton. */}
      {download.truncated && (
        <ExportTruncatedBanner
          className="basis-full"
          count={known}
          limit={limit}
          onDismiss={download.dismissTruncated}
        />
      )}
    </>
  );
}

/** Nombre de lignes annoncé : celui de l'écran, ou lu à l'ouverture. */
function useExportCount({ count, loadCount, uncounted }: ExportButtonProps) {
  const [loaded, setLoaded] = useState<ExportCount>({ status: 'loading' });
  const [controller, setController] = useState<AbortController | null>(null);

  const cancel = () => controller?.abort();

  const refresh = () => {
    if (uncounted || !loadCount || count != null) return;
    controller?.abort();
    const next = new AbortController();
    setController(next);
    setLoaded({ status: 'loading' });
    loadCount(next.signal)
      .then((value) => {
        if (!next.signal.aborted) setLoaded({ status: 'known', value });
      })
      .catch(() => {
        // Le nombre n'est qu'une annonce : son échec est dit (« Nombre de
        // lignes inconnu ») sans empêcher l'export.
        if (!next.signal.aborted) setLoaded({ status: 'unknown' });
      });
  };

  const resolved: ExportCount = uncounted
    ? { status: 'none' }
    : count != null
      ? { status: 'known', value: count }
      : loadCount
        ? loaded
        : { status: count === null ? 'loading' : 'unknown' };
  return { count: resolved, refresh, cancel };
}
