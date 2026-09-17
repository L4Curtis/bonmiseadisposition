import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { AutoIframe } from './AutoIframe';
import { VariablesHelp } from './VariablesHelp';
import type { TemplateDefinition, TemplateHtml } from './types';

interface EmailTemplateEditorProps {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EmailTemplateEditor({
  template, open, onClose, onSaved,
}: EmailTemplateEditorProps) {
  const [data, setData] = useState<TemplateHtml | null>(null);
  const [html, setHtml] = useState('');
  const [tab, setTab] = useState<'code' | 'preview'>('code');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !template) { setData(null); setHtml(''); return; }
    let cancelled = false;
    setTab('code');
    api.get<TemplateHtml>(`/admin/email-templates/${template.id}/html`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setHtml(d.html);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Erreur', description: 'Impossible de charger le template.', variant: 'destructive' });
      });
    return () => { cancelled = true; };
  }, [open, template]);

  const handleSave = async () => {
    if (!template || !html.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/admin/email-templates/${template.id}`, { html });
      toast({ title: 'Template sauvegarde' });
      onSaved();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            {template && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: template.headerColor }} />}
            Modifier — {template?.name}
          </DialogTitle>
          <DialogDescription>{template?.description}</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {(['code', 'preview'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'code' ? 'Editeur HTML' : 'Apercu'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          {tab === 'code' && (
            <div className="flex-1 flex flex-col min-h-0">
              {!data ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  className="flex-1 font-mono text-xs p-4 resize-none focus:outline-none bg-background text-foreground"
                  spellCheck={false}
                  style={{ minHeight: 400 }}
                />
              )}
              {data && <VariablesHelp variables={data.variables} />}
            </div>
          )}

          {tab === 'preview' && (
            <div className="flex-1 bg-white dark:bg-card overflow-auto">
              <AutoIframe srcDoc={html} title="Apercu" />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
          <Button onClick={handleSave} disabled={saving || !data}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
