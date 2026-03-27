import React, { useState, useEffect, useRef, useCallback, SyntheticEvent } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Eye, Pencil, RotateCcw, Download, Upload, Loader2,
} from 'lucide-react';

interface Variable { name: string; description: string }

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'signature' | 'contestation' | 'rappel';
  recipient: string;
  headerColor: string;
  variables: Variable[];
  isCustomized: boolean;
}

interface TemplateHtml {
  html: string;
  defaultHtml: string;
  isCustomized: boolean;
  variables: Variable[];
}

const CATEGORY_COLORS: Record<string, string> = {
  signature: 'bg-blue-500',
  contestation: 'bg-red-500',
  rappel: 'bg-orange-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  signature: 'Signature',
  contestation: 'Contestation',
  rappel: 'Rappel',
};

// ─── Auto-resize iframe ──────────────────────────────────────────────────────

function AutoIframe({ srcDoc, title }: { srcDoc: string; title?: string }) {
  const [height, setHeight] = useState(300);

  const handleLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
    const h = e.currentTarget.contentDocument?.documentElement?.scrollHeight;
    if (h && h > 0) setHeight(h + 16);
  };

  return (
    <iframe
      srcDoc={srcDoc}
      title={title}
      onLoad={handleLoad}
      style={{ width: '100%', height, border: 'none', display: 'block' }}
      sandbox="allow-same-origin"
    />
  );
}

// ─── Preview Dialog ──────────────────────────────────────────────────────────

function PreviewDialog({
  template, open, onClose,
}: {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !template) { setHtml(null); return; }
    setLoading(true);
    api.get<{ html: string }>(`/admin/email-templates/${template.id}/preview`)
      .then((r) => setHtml(r.html))
      .catch(() => toast({ title: 'Erreur', description: "Impossible de charger l'apercu.", variant: 'destructive' }))
      .finally(() => setLoading(false));
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

// ─── Edit Dialog ─────────────────────────────────────────────────────────────

function EditDialog({
  template, open, onClose, onSaved,
}: {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<TemplateHtml | null>(null);
  const [html, setHtml] = useState('');
  const [tab, setTab] = useState<'code' | 'preview'>('code');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !template) { setData(null); return; }
    setTab('code');
    api.get<TemplateHtml>(`/admin/email-templates/${template.id}/html`)
      .then((d) => { setData(d); setHtml(d.html); })
      .catch(() => toast({ title: 'Erreur', description: 'Impossible de charger le template.', variant: 'destructive' }));
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
              {data && data.variables.length > 0 && (
                <div className="border-t px-4 py-3 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Variables disponibles :</p>
                  <div className="flex flex-wrap gap-2">
                    {data.variables.map((v) => (
                      <span
                        key={v.name}
                        title={v.description}
                        className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-mono cursor-pointer hover:bg-muted/80"
                        onClick={() => {
                          const token = `{{${v.name}}}`;
                          navigator.clipboard?.writeText(token);
                          toast({ title: 'Copie', description: `${token} copie dans le presse-papier` });
                        }}
                      >
                        {`{{${v.name}}}`}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">Cliquez sur une variable pour la copier.</p>
                </div>
              )}
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

// ─── Reset Dialog ────────────────────────────────────────────────────────────

function ResetDialog({
  template, open, onClose, onReset,
}: {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
  onReset: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!template) return;
    setLoading(true);
    try {
      await api.delete(`/admin/email-templates/${template.id}`);
      toast({ title: 'Template reinitialise' });
      onReset();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de reinitialiser.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reinitialiser le template</DialogTitle>
          <DialogDescription>
            Le template <strong>{template?.name}</strong> sera remplace par sa version par defaut. Cette action est irreversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
          <Button variant="destructive" onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Reinitialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<TemplateDefinition | null>(null);
  const [editTarget, setEditTarget] = useState<TemplateDefinition | null>(null);
  const [resetTarget, setResetTarget] = useState<TemplateDefinition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.get<TemplateDefinition[]>('/admin/email-templates');
      setTemplates(data);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les templates.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleExport = async () => {
    try {
      const data = await api.get<object>('/admin/email-templates/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `email-templates-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export reussi' });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'exporter.", variant: 'destructive' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { templates?: { id: string; html: string }[] };
      if (!Array.isArray(data?.templates)) {
        toast({ title: 'Erreur', description: 'Format JSON invalide', variant: 'destructive' });
        return;
      }
      const result = await api.post<{ imported: number; skipped: number }>('/admin/email-templates/import', data);
      toast({ title: `Import : ${result.imported} template(s) importe(s), ${result.skipped} ignore(s)` });
      await fetchTemplates();
    } catch {
      toast({ title: 'Erreur', description: "Echec de l'import", variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Modeles d'emails</h1>
          <p className="text-sm text-muted-foreground mt-1">Personnalisez les emails automatiques envoyes par l'application</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Exporter
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importer
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </div>

      {/* Template list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center gap-4 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
            >
              {/* Color dot */}
              <div className={`h-3 w-3 rounded-full shrink-0 ${CATEGORY_COLORS[tpl.category] ?? 'bg-gray-400'}`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{tpl.name}</p>
                  {tpl.isCustomized && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-500">
                      Modifie
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>
              </div>

              {/* Recipient */}
              <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{tpl.recipient}</span>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setPreviewTarget(tpl)} title="Apercu">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditTarget(tpl)} title="Modifier">
                  <Pencil className="h-4 w-4" />
                </Button>
                {tpl.isCustomized && (
                  <Button variant="ghost" size="sm" onClick={() => setResetTarget(tpl)} title="Reinitialiser">
                    <RotateCcw className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <PreviewDialog
        template={previewTarget}
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
      <EditDialog
        template={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={fetchTemplates}
      />
      <ResetDialog
        template={resetTarget}
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={fetchTemplates}
      />
    </div>
  );
}
