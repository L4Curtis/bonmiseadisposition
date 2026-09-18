import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { PdfSnapshotInfo } from './types';
import { SNAPSHOT_LABELS } from './types';

export interface BonPdfSnapshotsProps {
  readonly snapshots: readonly PdfSnapshotInfo[];
  readonly pdfLoading: string | null;
  readonly onDownloadSnapshot: (stage: string, loadingKey: string) => void;
  /** Types de snapshot attendus mais absents — chargé (IT uniquement) depuis
   *  GET /bons/:id/pdf-snapshots/missing, une route séparée de
   *  /pdf-snapshots (qui reste un simple tableau, dont dépend le portail
   *  collaborateur). Toujours un tableau, vide si non fourni ou non IT. */
  readonly missing?: readonly string[];
  /** Affiche le bouton « Régénérer » (réservé aux admins). */
  readonly isAdmin?: boolean;
  readonly onRegenerateMissing?: () => void;
  readonly regenerating?: boolean;
}

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" /> Documents PDF ({snapshots.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {missing.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Document(s) manquant(s) : {missing.map((m) => SNAPSHOT_LABELS[m] || m).join(', ')}</span>
            </div>
            {isAdmin && onRegenerateMissing && (
              <Button variant="outline" size="sm" onClick={onRegenerateMissing} disabled={regenerating}>
                {regenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                Régénérer
              </Button>
            )}
          </div>
        )}
        {snapshots.map((snap) => (
          <div
            key={snap.type}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {SNAPSHOT_LABELS[snap.type] || snap.type}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {formatDateTime(snap.createdAt)}
                {snap.sha256 && (
                  <span
                    className="ml-2 font-mono text-muted-foreground/50"
                    title={`Empreinte SHA-256 du document (intégrité vérifiable) : ${snap.sha256}`}
                  >
                    SHA-256 {snap.sha256.slice(0, 12)}…
                  </span>
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadSnapshot(snap.type, `snap-${snap.type}`)}
              disabled={pdfLoading === `snap-${snap.type}`}
            >
              {pdfLoading === `snap-${snap.type}`
                ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                : <Download className="h-3.5 w-3.5" />}
              Télécharger
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
