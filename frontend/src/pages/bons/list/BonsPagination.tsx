import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface BonsPaginationProps {
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly onPrevPage: () => void;
  readonly onNextPage: () => void;
}

/** Résumé de plage affichée + navigation page précédente/suivante. Masquée
 *  entièrement par l'appelant quand `total === 0`. */
export function BonsPagination({
  total,
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  onPrevPage,
  onNextPage,
}: BonsPaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? 'Aucun résultat'
          : `Affichage ${rangeStart}–${rangeEnd} sur ${total}`}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
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
            className="border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
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
