import { Link } from 'react-router';
import { ShieldX } from 'lucide-react';
import { SCREEN_LABELS } from '@/domain/labels';
import { usePageTitle } from '@/hooks/usePageTitle';

/**
 * Écran réservé à d'autres profils (lien partagé par un collègue, favori,
 * adresse tapée). La page s'affiche dans la coque, menu compris : on peut
 * repartir d'une entrée du menu ou revenir à l'accueil.
 */
export function UnauthorizedPage() {
  usePageTitle(SCREEN_LABELS.accesRefuse);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <ShieldX className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{SCREEN_LABELS.accesRefuse}</h1>
        <p className="mt-2 text-muted-foreground">
          Cet écran est réservé à d’autres profils. Si vous pensez en avoir besoin, adressez-vous au service
          informatique.
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
