import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PAGE_SIZE_OPTIONS, isPageSize, type PageSize } from '@/hooks/usePagination';

/** Nom des éléments listés, pour « 26–50 sur 132 bons ». */
export interface ItemLabel {
  readonly singular: string;
  readonly plural: string;
}

export interface PaginationProps {
  readonly page: number;
  readonly pageSize: PageSize;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  /** Absent : pas de choix du nombre de lignes. */
  readonly onPageSizeChange?: (size: PageSize) => void;
  readonly itemLabel: ItemLabel;
  readonly className?: string;
}

const NUMBER = new Intl.NumberFormat('fr-FR');
// Cible tactile de 44 px sur téléphone, taille compacte à partir de 640 px.
const TOUCH = 'h-11 min-w-11 sm:h-8 sm:min-w-0';

/**
 * Pagination commune à toutes les listes : « 26–50 sur 132 bons »,
 * Précédent / Suivant et le choix de 25, 50 ou 100 lignes par page.
 * Se branche sur `usePagination`. Rien n'est affiché pour une liste vide :
 * l'état vide de `ListState` en tient lieu.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel,
  className,
}: PaginationProps) {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const noun = total > 1 ? itemLabel.plural : itemLabel.singular;

  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {`${NUMBER.format(rangeStart)}–${NUMBER.format(rangeEnd)} sur ${NUMBER.format(total)} ${noun}`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Lignes par page
            <select
              value={pageSize}
              onChange={(e) => {
                const size = Number(e.target.value);
                if (isPageSize(size)) onPageSizeChange(size);
              }}
              className={cn(TOUCH, 'rounded-lg border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}

        <Button
          variant="outline"
          size="sm"
          className={TOUCH}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Précédent</span>
        </Button>
        <span className="px-1 text-sm text-muted-foreground">{`Page ${page} sur ${totalPages}`}</span>
        <Button
          variant="outline"
          size="sm"
          className={TOUCH}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Page suivante"
        >
          <span className="hidden sm:inline">Suivant</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
