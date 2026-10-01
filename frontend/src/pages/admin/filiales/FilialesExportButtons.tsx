import { ExportButton } from '@/components/export';
import { todayInParis } from '@/lib/dates';

const ITEM_LABEL = { singular: 'filiale', plural: 'filiales' } as const;

export interface FilialesExportButtonsProps {
  /** Filiales affichées par l'écran : celles que contiendra le fichier. */
  readonly count: number | null;
  /** L'écran montre aussi les filiales désactivées. */
  readonly showInactive: boolean;
}

/**
 * Exports CSV des filiales, mêmes filiales que l'écran (actives seulement,
 * ou désactivées comprises) : le fichier simple, et celui qui embarque logos
 * et cachets pour un import sur une autre installation. Chacun annonce avant
 * de télécharger le nombre de filiales et le filtre appliqué.
 */
export function FilialesExportButtons({ count, showInactive }: FilialesExportButtonsProps) {
  const status = showInactive ? 'all' : 'active';
  const filters = [{ label: 'État', value: showInactive ? 'actives et désactivées' : 'actives seulement' }];
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <ExportButton
        path={`/filiales/export?status=${status}`}
        fallbackFilename={`filiales-${todayInParis()}.csv`}
        filters={filters}
        count={count}
        itemLabel={ITEM_LABEL}
        errorMessage="Erreur lors de l'export des filiales"
      />
      <ExportButton
        path={`/filiales/export?status=${status}&images=1`}
        fallbackFilename={`filiales-avec-images-${todayInParis()}.csv`}
        filters={filters}
        count={count}
        itemLabel={ITEM_LABEL}
        label="Exporter avec images"
        title="Exporter en CSV, logos et cachets compris"
        note="Fichier volumineux : logos et cachets y sont encodés, pour les réimporter sur une autre installation."
        errorMessage="Erreur lors de l'export des filiales"
      />
    </div>
  );
}
