import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface PdfTemplatePreviewProps {
  templateId: string | null;
  open: boolean;
  onClose: () => void;
}

export function PdfTemplatePreview({ templateId, open, onClose }: PdfTemplatePreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !templateId) { setPdfUrl(null); return; }
    setLoading(true);
    // Capture locale : le cleanup doit révoquer l'URL réellement créée par CET
    // effet, pas la valeur (périmée) de l'état au moment de son exécution
    let createdUrl: string | null = null;
    api.getBlob(`/admin/pdf-templates/${templateId}/preview`)
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      })
      .catch(() => setPdfUrl(null))
      .finally(() => setLoading(false));

    return () => { if (createdUrl) URL.revokeObjectURL(createdUrl); };
  }, [open, templateId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Apercu PDF</DialogTitle>
          <DialogDescription>Visualisation avec des donnees fictives</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="flex-1 w-full rounded border border-border min-h-0"
            title="Apercu PDF"
          />
        ) : (
          <p className="flex-1 flex items-center justify-center text-muted-foreground">Impossible de charger l'apercu</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
