import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CataloguePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

/** Pagination côté client de la table du catalogue (volume faible : le
 *  filtrage et le tri se font entièrement dans le navigateur, voir
 *  {@link ../useCatalogueFilters}). */
export function CataloguePagination({
  page, totalPages, total, pageSize, onPrevPage, onNextPage,
}: CataloguePaginationProps) {
  if (total === 0) return null;

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-sm text-muted-foreground">
        Affichage {rangeStart}–{rangeEnd} sur {total}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={onPrevPage}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>

          <span className="text-sm text-muted-foreground px-1">
            Page <span className="font-medium text-foreground/80">{page}</span> sur{' '}
            <span className="font-medium text-foreground/80">{totalPages}</span>
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={onNextPage}
            aria-label="Page suivante"
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
