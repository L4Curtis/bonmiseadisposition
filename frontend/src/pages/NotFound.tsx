import { Link } from 'react-router';
import { SearchX } from 'lucide-react';
import { SCREEN_LABELS } from '@/domain/labels';
import { usePageTitle } from '@/hooks/usePageTitle';

/**
 * Adresse inconnue (lien ancien, mal copié, page supprimée). On le dit
 * franchement au lieu de renvoyer en silence à l'accueil, qui laissait croire
 * que l'information avait disparu.
 */
export function NotFoundPage() {
  usePageTitle(SCREEN_LABELS.introuvable);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <SearchX className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{SCREEN_LABELS.introuvable}</h1>
        <p className="mt-2 text-muted-foreground">
          Cette adresse ne correspond à aucune page. Le lien est peut-être ancien ou incomplet.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
