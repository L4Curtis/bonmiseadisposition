import { Link } from 'react-router';
import { AlertOctagon, Clock, ExternalLink, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateLong } from '@/lib/dates';
import { RequestNewLinkButton } from '@/pages/signature/components/RequestNewLinkButton';
import type { DocumentToSign } from '../lib/portal-classification';
import { documentToSignTitle } from '../lib/portal-labels';
import type { ContestTarget } from '../hooks/usePortal';

const PRIMARY = 'w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold';

/** Ce que la personne peut faire pour ce document : signer, attendre le
 *  guichet, ou demander un nouveau lien. */
function DocumentAction({ doc }: { doc: DocumentToSign }) {
  if (doc.inPerson) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4 mt-0.5 shrink-0" /> Ce document se signe au guichet, avec l'équipe informatique.
      </p>
    );
  }
  if (doc.token) {
    return (
      <a href={`/signer/${doc.token}`} className={`${PRIMARY} btn-gradient text-primary-foreground`}>
        <ExternalLink className="h-4 w-4" /> Signer maintenant
      </a>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-warning">Le lien de signature a expiré.</p>
      {doc.requestToken ? (
        <RequestNewLinkButton token={doc.requestToken} />
      ) : (
        <p className="text-sm text-muted-foreground">Demandez un nouveau lien à l'équipe informatique.</p>
      )}
    </div>
  );
}

interface DocumentCardProps {
  doc: DocumentToSign;
  onContest: (target: ContestTarget) => void;
  /** Lien « Voir le bon » (inutile sur la fiche du bon elle-même). */
  showBonLink?: boolean;
}

/** Un document à signer et ce qu'on peut en faire. */
export function DocumentCard({ doc, onContest, showBonLink = true }: DocumentCardProps) {
  const canContest = doc.type !== 'mise_disposition' && !doc.inPerson;
  return (
    <Card className="border-warning/40">
      <CardContent className="p-4 space-y-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">{documentToSignTitle(doc.type)}</h3>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{doc.bon.reference}</span> · {doc.bon.filiale.displayName}
          </p>
          {doc.since && <p className="text-xs text-muted-foreground mt-0.5">Demandé le {formatDateLong(doc.since)}</p>}
        </div>
        <DocumentAction doc={doc} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          {showBonLink && (
            <Link
              to={`/mes-bons/${doc.bon.id}`}
              className="min-h-11 inline-flex items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted/50"
            >
              Voir le bon
            </Link>
          )}
          {canContest && (
            <button
              type="button"
              onClick={() => onContest({ bon: doc.bon, document: doc.type })}
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/40 px-4 text-sm font-medium text-destructive hover:bg-destructive/5"
            >
              <AlertOctagon className="h-4 w-4" /> Je ne suis pas d'accord
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ToSignSectionProps {
  documents: readonly DocumentToSign[];
  onContest: (target: ContestTarget) => void;
}

/** « À signer » : chaque document qui attend la signature, lien valide ou non (R-057). */
export function ToSignSection({ documents, onContest }: ToSignSectionProps) {
  return (
    <section id="a-signer" aria-labelledby="a-signer-titre" className="scroll-mt-20">
      <h2 id="a-signer-titre" className="text-sm font-semibold text-warning uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Clock className="h-4 w-4" /> À signer ({documents.length})
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {documents.map((doc) => (
          <DocumentCard key={`${doc.bon.id}-${doc.type}`} doc={doc} onContest={onContest} />
        ))}
      </div>
    </section>
  );
}
