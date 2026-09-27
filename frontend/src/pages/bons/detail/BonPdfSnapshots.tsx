import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { PdfSnapshotInfo } from './types';
import { SNAPSHOT_LABELS } from './types';
import { DocumentLine, documentLines } from './pdf-documents';

export interface BonPdfSnapshotsProps {
  /** Tous les documents du bon, du plus ancien au plus récent : un par
   *  signature, jamais écrasé (GET /bons/:id/pdf-snapshots). */
  readonly snapshots: readonly PdfSnapshotInfo[];
  readonly pdfLoading: string | null;
  /** Télécharge un document précis : son identifiant et son nom de fichier. */
  readonly onDownloadSnapshot: (snapshotId: string, filename: string) => void;
  /** Types de document attendus mais absents (IT uniquement,
   *  GET /bons/:id/pdf-snapshots/missing). Toujours un tableau. */
  readonly missing?: readonly string[];
  /** Affiche le bouton « Régénérer » (réservé aux admins). */
  readonly isAdmin?: boolean;
  readonly onRegenerateMissing?: () => void;
  readonly regenerating?: boolean;
}

function MissingDocuments({ missing, isAdmin, onRegenerateMissing, regenerating }: Pick<BonPdfSnapshotsProps, 'isAdmin' | 'onRegenerateMissing' | 'regenerating'> & { missing: readonly string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Document(s) manquant(s) : {missing.map((m) => SNAPSHOT_LABELS[m] || m).join(', ')}</span>
      </div>
      {isAdmin && onRegenerateMissing && (
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={onRegenerateMissing} disabled={regenerating}>
          {regenerating
            ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          Régénérer
        </Button>
      )}
    </div>
  );
}

function DocumentRow({ line, pdfLoading, onDownload }: { line: DocumentLine; pdfLoading: string | null; onDownload: () => void }) {
  const loading = pdfLoading === line.id;
  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/40',
        line.superseded && 'bg-muted/30',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium break-words', line.superseded ? 'text-muted-foreground' : 'text-foreground')}>
          {line.title}
        </p>
        <p className="text-xs text-muted-foreground/70 break-words">
          {formatDateTime(line.createdAt)}
          {line.status && (
            <span className={cn('ml-2 font-medium', line.superseded ? 'text-warning' : 'text-success')}>{line.status}</span>
          )}
          {line.sha256 && (
            <span
              className="ml-2 font-mono text-muted-foreground/50"
              title={`Empreinte SHA-256 du document (la même que dans le journal d'audit) : ${line.sha256}`}
            >
              SHA-256 {line.sha256.slice(0, 12)}…
            </span>
          )}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 sm:min-h-9"
        onClick={onDownload}
        disabled={loading}
        aria-label={`Télécharger ${line.title} du ${formatDateTime(line.createdAt)}`}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          : <Download className="h-3.5 w-3.5" />}
        Télécharger
      </Button>
    </li>
  );
}

/**
 * « Documents PDF » de la fiche : TOUS les documents signés, dans l'ordre où
 * ils ont été produits, chacun avec sa vraie date et son empreinte. Un même
 * document qui revient (deux restitutions, remise signée de nouveau) garde
 * chaque version ; la version en vigueur est signalée, une version qui ne
 * vaut plus dit pourquoi.
 */
export function BonPdfSnapshots({
  snapshots,
  pdfLoading,
  onDownloadSnapshot,
  missing = [],
  isAdmin = false,
  onRegenerateMissing,
  regenerating = false,
}: BonPdfSnapshotsProps) {
  if (snapshots.length === 0 && missing.length === 0) return null;
  const lines = documentLines(snapshots);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" /> Documents PDF ({snapshots.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {missing.length > 0 && (
          <MissingDocuments missing={missing} isAdmin={isAdmin} onRegenerateMissing={onRegenerateMissing} regenerating={regenerating} />
        )}
        <ul className="space-y-2">
          {lines.map((line) => (
            <DocumentRow
              key={line.id}
              line={line}
              pdfLoading={pdfLoading}
              onDownload={() => onDownloadSnapshot(line.id, line.filename)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
