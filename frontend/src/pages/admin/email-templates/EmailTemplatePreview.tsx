import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Info } from 'lucide-react';
import { AutoIframe } from './AutoIframe';
import { BonPicker } from './BonPicker';
import { NON_BON_CATEGORIES } from './types';
import type { BonPreviewResult, PreviewBonOption, TemplateDefinition } from './types';

interface EmailTemplatePreviewProps {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
}

type PreviewMode = 'sample' | 'bon';

function PreviewFrame({ loading, html, title }: { loading: boolean; html: string | null; title?: string }) {
  return (
    <div className="flex-1 overflow-auto rounded-md border bg-white dark:bg-card min-h-[12rem]">
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
        <AutoIframe srcDoc={html} title={title} />
      ) : null}
    </div>
  );
}

/** Ce que l'aperçu avec un bon réel montre, et ce qu'il ne montre pas. */
function BonPreviewNotice({ result }: { result: BonPreviewResult }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-1">
        <p>
          Sujet : <span className="font-medium text-foreground">{result.subject}</span>
        </p>
        <p>Le lien de signature est factice : l'aperçu ne crée ni n'expose aucun lien valide.</p>
        {result.sampleVariables.length > 0 && (
          <p>
            Valeurs d'exemple (le bon ne les renseigne pas) :{' '}
            {result.sampleVariables.map((v) => <code key={v} className="mr-1">{`{{${v}}}`}</code>)}
          </p>
        )}
      </div>
    </div>
  );
}

/** Aperçu d'un modèle : données d'exemple, ou données d'un vrai bon choisi par
 *  sa référence (lot H3 — lecture seule, aucun envoi, lien de signature factice). */
export function EmailTemplatePreview({ template, open, onClose }: EmailTemplatePreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('sample');
  const [bon, setBon] = useState<PreviewBonOption | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [bonResult, setBonResult] = useState<BonPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);

  const bonAllowed = !!template && !NON_BON_CATEGORIES.includes(template.category);

  // Réinitialisation à chaque ouverture : un aperçu repart des données d'exemple.
  useEffect(() => {
    if (!open) { setMode('sample'); setBon(null); }
  }, [open]);

  useEffect(() => {
    setHtml(null);
    setBonResult(null);
    if (!open || !template) return;
    if (mode === 'bon' && !bon) return;
    let cancelled = false;
    setLoading(true);
    const request = mode === 'bon' && bon
      ? api.get<BonPreviewResult>(`/admin/email-templates/${template.id}/preview-bon/${bon.id}`)
        .then((r) => { if (!cancelled) { setBonResult(r); setHtml(r.html); } })
      : api.get<{ html: string }>(`/admin/email-templates/${template.id}/preview`)
        .then((r) => { if (!cancelled) setHtml(r.html); });
    request
      .catch((e: unknown) => {
        if (cancelled) return;
        toast({ title: 'Erreur', description: errorMessage(e, "Impossible de charger l'aperçu."), variant: 'destructive' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, template, mode, bon]);

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

        {bonAllowed && (
          <div className="space-y-3">
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Données de l'aperçu">
              <Button
                type="button" size="sm" variant={mode === 'sample' ? 'secondary' : 'ghost'}
                aria-pressed={mode === 'sample'} onClick={() => setMode('sample')}
              >
                Données d'exemple
              </Button>
              <Button
                type="button" size="sm" variant={mode === 'bon' ? 'secondary' : 'ghost'}
                aria-pressed={mode === 'bon'} onClick={() => setMode('bon')}
              >
                Un bon réel
              </Button>
            </div>
            {mode === 'bon' && <BonPicker idPrefix="email-preview" selected={bon} onSelect={setBon} />}
            {mode === 'bon' && bonResult && <BonPreviewNotice result={bonResult} />}
          </div>
        )}

        {(mode === 'sample' || bon) && <PreviewFrame loading={loading} html={html} title={template?.name} />}

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Fermer</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
