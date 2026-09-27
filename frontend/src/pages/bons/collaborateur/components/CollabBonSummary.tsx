import { CheckCircle2, ExternalLink, FileText, Loader2 } from 'lucide-react';
import type { PdfSnapshotInfo } from '@/contracts/bons';
import { formatDateLong } from '@/lib/dates';
import { collaboratorDocuments, collaboratorSignatures, CollaboratorBon } from '../lib/collaborator-view';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Dates et signatures du collaborateur, dans l'ordre où elles ont eu lieu. */
export function CollabDatesAndSignatures({ bon }: { bon: CollaboratorBon }) {
  const signatures = collaboratorSignatures(bon.signatures);
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm space-y-2 text-sm">
      <Row label="Remis le" value={formatDateLong(bon.dateMiseDisposition)} />
      {bon.dateRestitution && <Row label="Retour prévu le" value={formatDateLong(bon.dateRestitution)} />}
      {signatures.map((s) => (
        <p key={s.id} className="flex items-start gap-2 text-success">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {s.label} — signée le {formatDateLong(s.signedAt)}
            {s.atCounter ? ', au guichet' : ''}
          </span>
        </p>
      ))}
    </section>
  );
}

interface CollabDocumentsProps {
  snapshots: readonly PdfSnapshotInfo[];
  pdfLoading: string | null;
  /** Ouvre le document dans le navigateur (pas de téléchargement). */
  onOpen: (stage: string) => void;
}

/** Documents du bon : un par étape, nommés, un seul geste chacun (R-092),
 *  ouverts dans le navigateur du téléphone. */
export function CollabDocuments({ snapshots, pdfLoading, onOpen }: CollabDocumentsProps) {
  const documents = collaboratorDocuments(snapshots);
  return (
    <section aria-labelledby="documents-du-bon" className="space-y-2">
      <h2 id="documents-du-bon" className="flex items-center gap-2 font-semibold">
        <FileText className="h-4 w-4 text-muted-foreground" /> Documents
      </h2>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun document signé pour l'instant.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.type}>
              <button
                type="button"
                onClick={() => onOpen(doc.type)}
                disabled={!!pdfLoading}
                aria-label={`Ouvrir ${doc.label}`}
                className="w-full min-h-11 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 text-left text-sm shadow-sm hover:bg-muted/40 disabled:opacity-60"
              >
                <span>
                  <span className="font-medium">{doc.label}</span>
                  <span className="block text-xs text-muted-foreground">du {formatDateLong(doc.createdAt)}</span>
                </span>
                {pdfLoading === doc.type ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
