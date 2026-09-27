import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { bonStatusLabel } from '@/domain/labels';
import type { CollaboratorBon } from '../lib/collaborator-view';

/** En-tête de la fiche : retour, référence, où en est le bon, et le lien
 *  avec un bon remplaçant ou remplacé (contestation Fondée). */
export function CollabBonHeader({ bon }: { bon: CollaboratorBon }) {
  return (
    <div className="space-y-2">
      <Link
        to="/mes-bons"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Mes équipements
      </Link>
      <div>
        <h1 className="text-xl font-bold font-mono [overflow-wrap:anywhere]">{bon.reference}</h1>
        <p className="text-sm text-muted-foreground">
          {bonStatusLabel(bon.status)} · {bon.filiale.displayName}
        </p>
      </div>
      {bon.replacedBy &&
        (bon.status === 'archived' ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            Ce bon est remplacé par le bon{' '}
            <Link to={`/mes-bons/${bon.replacedBy.id}`} className="font-mono font-semibold text-primary underline-offset-2 hover:underline">
              {bon.replacedBy.reference}
            </Link>
            .
          </p>
        ) : (
          // Le bon corrigé est encore en préparation par l'équipe informatique :
          // il n'apparaît au collaborateur qu'une fois envoyé.
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            Un bon corrigé (<span className="font-mono font-semibold">{bon.replacedBy.reference}</span>) va remplacer
            celui-ci : vous le recevrez à signer.
          </p>
        ))}
      {bon.replaces && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          Ce bon corrige le bon{' '}
          <Link to={`/mes-bons/${bon.replaces.id}`} className="font-mono font-semibold text-primary underline-offset-2 hover:underline">
            {bon.replaces.reference}
          </Link>
          , que vous aviez contesté.
        </p>
      )}
    </div>
  );
}
