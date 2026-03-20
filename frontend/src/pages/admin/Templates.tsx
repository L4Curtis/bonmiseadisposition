import React, { useState, useEffect, useRef, SyntheticEvent } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
  Eye, Mail, AlertTriangle, Clock, Pencil, RotateCcw, Download, Upload, Loader2, Users,
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

/** Iframe that auto-resizes to its content height — eliminates the inner scrollbar */
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

const CATEGORY_CONFIG = {
  signature:    { label: 'Signature',    icon: Mail,          cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  contestation: { label: 'Contestation', icon: AlertTriangle,  cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  rappel:       { label: 'Rappel',       icon: Clock,          cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
};

function CategoryBadge({ category }: { category: TemplateDefinition['category'] }) {
  const { label, icon: Icon, cls } = CATEGORY_CONFIG[category];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─── Preview dialog ──────────────────────────────────────────────────────────

function PreviewDialog({
  template,
  onClose,
}: {
  template: TemplateDefinition | null;
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!template) return;
    setHtml(null);
    setLoading(true);
    api.get<{ html: string }>(`/admin/templates/${template.id}/preview`)
      .then((r) => setHtml(r.html))
      .catch(() => toast({ title: 'Erreur', description: "Impossible de charger l'aperçu.", variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [template]);

  return (
    <Dialog open={!!template} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: template.headerColor }} />}
            {template?.name}
          </DialogTitle>
          <DialogDescription>{template?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border bg-white">
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

// ─── Edit dialog ─────────────────────────────────────────────────────────────

function EditDialog({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateDefinition | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<TemplateHtml | null>(null);
  const [html, setHtml] = useState('');
  const [tab, setTab] = useState<'code' | 'preview'>('code');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setData(null);
    setTab('code');
    api.get<TemplateHtml>(`/admin/templates/${template.id}/html`)
      .then((d) => { setData(d); setHtml(d.html); })
      .catch(() => toast({ title: 'Erreur', description: 'Impossible de charger le template.', variant: 'destructive' }));
  }, [template]);

  const handleTabChange = (newTab: 'code' | 'preview') => setTab(newTab);

  const handleSave = async () => {
    if (!template || !html.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/admin/templates/${template.id}`, { html });
      toast({ title: 'Template sauvegardé', description: 'Le template a été mis à jour.' });
      onSaved();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(o) => { if (!o) onClose(); }}>
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
              onClick={() => handleTabChange(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'code' ? 'Éditeur HTML' : 'Aperçu (données exemple)'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Code editor */}
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
              {/* Variables reference */}
              {data && data.variables.length > 0 && (
                <div className="border-t px-4 py-3 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Variables disponibles :</p>
                  <div className="flex flex-wrap gap-2">
                    {data.variables.map((v) => (
                      <span
                        key={v.name}
                        title={v.description}
                        className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-mono cursor-help"
                        onClick={() => {
                          const token = `{{${v.name}}}`;
                          navigator.clipboard?.writeText(token);
                          toast({ title: 'Copié', description: `${token} copié dans le presse-papier` });
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

          {/* Preview */}
          {tab === 'preview' && (
            <div className="flex-1 bg-white overflow-auto">
              <AutoIframe srcDoc={html} title="Aperçu" />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex items-center gap-2 mr-auto">
            {data?.isCustomized && (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">● Modifié</span>
            )}
          </div>
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

// ─── Reset confirm dialog ─────────────────────────────────────────────────────

function ResetDialog({
  template,
  onClose,
  onReset,
}: {
  template: TemplateDefinition | null;
  onClose: () => void;
  onReset: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!template) return;
    setLoading(true);
    try {
      await api.delete(`/admin/templates/${template.id}`);
      toast({ title: 'Template réinitialisé', description: 'Le template par défaut est restauré.' });
      onReset();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de réinitialiser.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Réinitialiser le template</DialogTitle>
          <DialogDescription>
            Le template <strong>{template?.name}</strong> sera remplacé par sa version par défaut. Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
          <Button variant="destructive" onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Réinitialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewTarget, setPreviewTarget] = useState<TemplateDefinition | null>(null);
  const [editTarget, setEditTarget] = useState<TemplateDefinition | null>(null);
  const [resetTarget, setResetTarget] = useState<TemplateDefinition | null>(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api.get<TemplateDefinition[]>('/admin/templates')
      .then(setTemplates)
      .catch(() => toast({ title: 'Erreur', description: 'Impossible de charger les templates.', variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleExport = async () => {
    try {
      const data = await api.get<object>('/admin/templates/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `email-templates-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'exporter les templates.", variant: 'destructive' });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { templates: { id: string; html: string }[] };
      if (!Array.isArray(data?.templates)) throw new Error('Format invalide');
      const result = await api.post<{ imported: number; skipped: number }>('/admin/templates/import', data);
      toast({ title: 'Import réussi', description: `${result.imported} template(s) importé(s), ${result.skipped} ignoré(s).` });
      load();
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.message ?? "Fichier invalide.", variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Templates d'emails
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Personnalisez les emails automatiques envoyés par l'application. Utilisez les variables <code className="text-xs bg-muted px-1 rounded">{'{{NOM_VARIABLE}}'}</code> pour insérer des données dynamiques.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
              <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span className="hidden sm:inline ml-1.5">Importer</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5">Exporter</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm" aria-label="Liste des templates d'emails">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nom</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Catégorie</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Destinataire</span>
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-64" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3 text-right"><Skeleton className="h-8 w-32 ml-auto" /></td>
                    </tr>
                  ))
                : templates.map((template) => (
                    <tr key={template.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: template.headerColor }} />
                          <span>{template.name}</span>
                          {template.isCustomized && (
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">● Modifié</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {template.description}
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={template.category} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {template.recipient}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => setPreviewTarget(template)} className="gap-1.5">
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden lg:inline">Aperçu</span>
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditTarget(template)} className="gap-1.5">
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden lg:inline">Modifier</span>
                          </Button>
                          {template.isCustomized && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setResetTarget(template)}
                              className="gap-1.5 text-muted-foreground hover:text-destructive"
                              title="Réinitialiser au template par défaut"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span className="hidden lg:inline">Reset</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <PreviewDialog template={previewTarget} onClose={() => setPreviewTarget(null)} />
      <EditDialog template={editTarget} onClose={() => setEditTarget(null)} onSaved={load} />
      <ResetDialog template={resetTarget} onClose={() => setResetTarget(null)} onReset={load} />
    </>
  );
}
