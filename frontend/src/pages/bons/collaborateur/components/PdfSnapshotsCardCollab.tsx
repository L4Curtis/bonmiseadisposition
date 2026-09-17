import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import { SNAPSHOT_LABELS } from '../../detail/types';
import type { PdfSnapshotInfo } from '../../detail/types';

interface PdfSnapshotsCardCollabProps {
  snapshots: PdfSnapshotInfo[];
  pdfLoading: string | null;
  onDownload: (type: string, stage: string) => void;
}

export function PdfSnapshotsCardCollab({ snapshots, pdfLoading, onDownload }: PdfSnapshotsCardCollabProps) {
  if (snapshots.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" /> Documents PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {snapshots.map((snap) => (
          <div key={snap.type} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{SNAPSHOT_LABELS[snap.type] ?? snap.type}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(snap.createdAt)}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Télécharger ${SNAPSHOT_LABELS[snap.type] ?? snap.type}`}
              onClick={() => onDownload('mise_disposition', snap.type)}
              disabled={!!pdfLoading}
            >
              {pdfLoading === snap.type ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
