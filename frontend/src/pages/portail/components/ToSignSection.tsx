import { Link } from 'react-router';
import { AlertOctagon, Clock, Info, PenLine, Users, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateLong } from '@/lib/dates';
import { RequestNewLinkButton } from '@/pages/signature/components/RequestNewLinkButton';
import type { DocumentToSign } from '../lib/portal-classification';
import { documentSituation, documentToSignTitle } from '../lib/portal-labels';
import type { ContestTarget } from '../hooks/usePortal';

const PRIMARY = 'w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold';

/** Ce que la personne peut faire pour ce document : signer, attendre le
 *  guichet ou la correction, lire le vrai motif d'un lien invalidé, ou
 *  demander un nouveau lien (une seule fois). */
function DocumentAction({ doc }: { doc: DocumentToSign }) {
  const situation = documentSituation(doc);
  switch (situation.kind) {
    case 'in_person':
      return (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 mt-0.5 shrink-0" /> Ce document se signe au guichet, avec l'équipe informatique.
        </p>
      );
    case 'sign':
      return (
        <a href={`/signer/${situation.token}`} className={`${PRIMARY} btn-gradient text-primary-foreground`}>
          <PenLine className="h-4 w-4" aria-hidden="true" /> Signer maintenant
        </a>
      );
    case 'correction':
    case 'invalidated':
    case 'requested':
      return (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" /> {situation.message}
        </p>
      );
    case 'expired':
      return (
        <div className="space-y-2">
          <p className="text-sm text-warning">Le lien de signature a expiré.</p>
          {situation.requestToken ? (
            <RequestNewLinkButton token={situation.requestToken} />
          ) : (
            <p className="text-sm text-muted-foreground">Demandez un nouveau lien à l'équipe informatique.</p>
          )}
        </div>
      );
  }
}

interface DocumentCardProps {
  doc: DocumentToSign;
  onContest: (target: ContestTarget) => void;
  /** Lien « Voir le bon » (inutile sur la fiche du bon elle-même). */
  showBonLink?: boolean;
}

/** Un document à signer et ce qu'on peut en faire. */
export function DocumentCard({ doc, onContest, showBonLink = true }: DocumentCardProps) {
  // Rien à contester tant que le lien n'est pas renvoyé : document en cours
  // de correction, bon modifié… (le document va changer).
  const canContest = doc.type !== 'mise_disposition' && !doc.inPerson && !doc.invalidatedReason;
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
        <div className="flex flex-col gap-2 empty:hidden sm:flex-row sm:justify-between">
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

/** « En cours de correction par l'équipe informatique » : documents rouverts
 *  après une contestation Fondée. Rien à signer ni à demander : ils ne sont
 *  ni dans « À signer » ni dans le bandeau ; leur matériel reste dans
 *  « Chez vous ». */
export function InCorrectionSection({ documents, onContest }: ToSignSectionProps) {
  return (
    <section aria-labelledby="en-correction-titre">
      <h2 id="en-correction-titre" className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Wrench className="h-4 w-4" aria-hidden="true" /> En cours de correction par l'équipe informatique ({documents.length})
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {documents.map((doc) => (
          <DocumentCard key={`${doc.bon.id}-${doc.type}`} doc={doc} onContest={onContest} />
        ))}
      </div>
    </section>
  );
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
