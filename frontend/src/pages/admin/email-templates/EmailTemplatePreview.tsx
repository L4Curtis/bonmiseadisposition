import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { AutoIframe } from './AutoIframe';
import type { TemplateDefinition } from './types';

interface EmailTemplatePreviewProps {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
}

export function EmailTemplatePreview({ template, open, onClose }: EmailTemplatePreviewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !template) { setHtml(null); return; }
    let cancelled = false;
    setLoading(true);
    api.get<{ html: string }>(`/admin/email-templates/${template.id}/preview`)
      .then((r) => { if (!cancelled) setHtml(r.html); })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Erreur', description: "Impossible de charger l'aperçu.", variant: 'destructive' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, template]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: template.headerColor }} />}
            {template?.name}
          </DialogTitle>
          <DialogDescription>{template?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border bg-white dark:bg-card">
          {loading ? (
            <div className="flex flex-col gap-3 p-8 w-full">
              <Skeleton className="h-16 w-full rounded-t-lg" />
              <div className="px-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-20 w-full rounded" />
                <Skeleton className="h-10 w-48 mx-auto rounded-lg" />
              </div>
            </div>
          ) : html ? (
            <AutoIframe srcDoc={html} title={template?.name} />
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Fermer</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
