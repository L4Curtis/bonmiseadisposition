import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { PdfSnapshotInfo } from './types';
import { SNAPSHOT_LABELS } from './types';

export interface BonPdfSnapshotsProps {
  readonly snapshots: readonly PdfSnapshotInfo[];
  readonly pdfLoading: string | null;
  readonly onDownloadSnapshot: (stage: string, loadingKey: string) => void;
}

export function BonPdfSnapshots({ snapshots, pdfLoading, onDownloadSnapshot }: BonPdfSnapshotsProps) {
  if (snapshots.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" /> Documents PDF ({snapshots.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {snapshots.map((snap) => (
          <div
            key={snap.type}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/40"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {SNAPSHOT_LABELS[snap.type] || snap.type}
              </p>
              <p className="text-xs text-muted-foreground/70">{formatDateTime(snap.createdAt)}</p>
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
