import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  FileText, Eye, Pencil, RotateCcw, Download, Upload, Loader2,
  ChevronDown, ChevronRight, Copy, Palette, Type, RulerIcon, LayoutTemplate,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PdfTemplateVariable {
  name: string;
  description: string;
}

interface PdfTemplateDefinition {
  id: string;
  name: string;
  description: string;
  documentType: string;
  variables: PdfTemplateVariable[];
  isCustomized: boolean;
}

interface PdfTemplateConfig {
  colors: Record<string, string>;
  fonts: Record<string, number>;
  margins: Record<string, number>;
  header: Record<string, unknown>;
  infoBoxes: Record<string, unknown>;
  table: Record<string, unknown>;
  signatures: Record<string, unknown>;
  footer: Record<string, unknown>;
}

// ─── Section config for the editor ───────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: 'color' | 'number' | 'text' | 'boolean';
  min?: number;
  max?: number;
}

const SECTIONS: { key: string; label: string; icon: typeof Palette; fields: FieldDef[] }[] = [
  {
    key: 'colors', label: 'Couleurs', icon: Palette,
    fields: [
      { key: 'primary', label: 'Couleur principale', type: 'color' },
      { key: 'dark', label: 'Texte principal', type: 'color' },
      { key: 'gray', label: 'Labels / secondaire', type: 'color' },
      { key: 'lightGray', label: 'Tertiaire', type: 'color' },
      { key: 'border', label: 'Bordures', type: 'color' },
      { key: 'headerBg', label: 'En-tete tableau', type: 'color' },
      { key: 'rowAlt', label: 'Ligne alternee', type: 'color' },
    ],
  },
  {
    key: 'fonts', label: 'Polices (taille)', icon: Type,
    fields: [
      { key: 'titleSize', label: 'Titre', type: 'number', min: 5, max: 24 },
      { key: 'subtitleSize', label: 'Sous-titre', type: 'number', min: 5, max: 24 },
      { key: 'bodySize', label: 'Corps', type: 'number', min: 5, max: 24 },
      { key: 'labelSize', label: 'Labels', type: 'number', min: 5, max: 24 },
      { key: 'tableHeaderSize', label: 'En-tete tableau', type: 'number', min: 5, max: 24 },
      { key: 'tableBodySize', label: 'Corps tableau', type: 'number', min: 5, max: 24 },
    ],
  },
  {
    key: 'margins', label: 'Marges (px)', icon: RulerIcon,
    fields: [
      { key: 'top', label: 'Haut', type: 'number', min: 10, max: 150 },
      { key: 'bottom', label: 'Bas', type: 'number', min: 10, max: 150 },
      { key: 'left', label: 'Gauche', type: 'number', min: 10, max: 150 },
      { key: 'right', label: 'Droite', type: 'number', min: 10, max: 150 },
    ],
  },
  {
    key: 'header', label: 'En-tete du document', icon: LayoutTemplate,
    fields: [
      { key: 'showLogo', label: 'Afficher le logo', type: 'boolean' },
      { key: 'logoMaxHeight', label: 'Hauteur max logo', type: 'number', min: 10, max: 200 },
      { key: 'logoMaxWidth', label: 'Largeur max logo', type: 'number', min: 30, max: 300 },
      { key: 'titleText', label: 'Titre du document', type: 'text' },
      { key: 'subtitleText', label: 'Sous-titre', type: 'text' },
      { key: 'showReference', label: 'Afficher la reference', type: 'boolean' },
      { key: 'showDates', label: 'Afficher les dates', type: 'boolean' },
    ],
  },
  {
    key: 'infoBoxes', label: 'Encadres d\'information', icon: LayoutTemplate,
    fields: [
      { key: 'showCollaborateur', label: 'Afficher collaborateur', type: 'boolean' },
      { key: 'showEntite', label: 'Afficher entite', type: 'boolean' },
      { key: 'collaborateurTitle', label: 'Titre encadre collaborateur', type: 'text' },
      { key: 'entiteTitle', label: 'Titre encadre entite', type: 'text' },
    ],
  },
  {
    key: 'table', label: 'Tableau des equipements', icon: LayoutTemplate,
    fields: [
      { key: 'sectionTitle', label: 'Titre de section', type: 'text' },
      { key: 'showRowNumbers', label: 'Numeros de ligne', type: 'boolean' },
      { key: 'emptyMessage', label: 'Message si vide', type: 'text' },
    ],
  },
  {
    key: 'signatures', label: 'Signatures', icon: FileText,
    fields: [
      { key: 'showSignatures', label: 'Afficher les signatures', type: 'boolean' },
      { key: 'itTitle', label: 'Titre IT', type: 'text' },
      { key: 'itMention', label: 'Mention legale IT', type: 'text' },
      { key: 'collabTitle', label: 'Titre collaborateur', type: 'text' },
      { key: 'collabMention', label: 'Mention legale collaborateur', type: 'text' },
    ],
  },
  {
    key: 'footer', label: 'Pied de page', icon: FileText,
    fields: [
      { key: 'showFooter', label: 'Afficher le pied de page', type: 'boolean' },
      { key: 'footerText', label: 'Texte du pied de page', type: 'text' },
    ],
  },
];

// ─── Toggle component ────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Collapsible section ─────────────────────────────────────────────────────

function SectionAccordion({
  label, icon: Icon, open, onToggle, children,
}: {
  label: string;
  icon: typeof Palette;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-2.5 bg-muted/50 hover:bg-muted text-left text-sm font-medium"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </button>
      {open && <div className="p-4 space-y-3 border-t border-border">{children}</div>}
    </div>
  );
}

// ─── Preview Dialog ──────────────────────────────────────────────────────────

function PreviewDialog({
  templateId, open, onClose,
}: { templateId: string | null; open: boolean; onClose: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !templateId) { setPdfUrl(null); return; }
    setLoading(true);
    api.getBlob(`/admin/pdf-templates/${templateId}/preview`)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch(() => setPdfUrl(null))
      .finally(() => setLoading(false));

    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

// ─── Edit Dialog ─────────────────────────────────────────────────────────────

function EditDialog({
  templateId, open, onClose, onSaved,
}: { templateId: string | null; open: boolean; onClose: () => void; onSaved: () => void }) {

  const [config, setConfig] = useState<PdfTemplateConfig | null>(null);
  const [variables, setVariables] = useState<PdfTemplateVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['colors']));

  useEffect(() => {
    if (!open || !templateId) return;
    setLoading(true);
    api.get<{ config: PdfTemplateConfig; variables: PdfTemplateVariable[] }>(
      `/admin/pdf-templates/${templateId}/config`,
    )
      .then((data) => {
        setConfig(data.config);
        setVariables(data.variables);
      })
      .catch(() => toast({ title: 'Erreur', description: 'Impossible de charger la configuration', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, templateId, toast]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const updateField = useCallback((section: string, key: string, value: unknown) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const sectionData = { ...(prev[section as keyof PdfTemplateConfig] as Record<string, unknown>) };
      sectionData[key] = value;
      return { ...prev, [section]: sectionData };
    });
  }, []);

  const handleSave = async () => {
    if (!templateId || !config) return;
    setSaving(true);
    try {
      await api.patch(`/admin/pdf-templates/${templateId}`, config);
      toast({ title: 'Modele mis a jour' });
      onSaved();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Echec de la sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyVariable = (name: string) => {
    navigator.clipboard.writeText(`{{${name}}}`);
    toast({ title: `{{${name}}} copie` });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le modele PDF</DialogTitle>
          <DialogDescription>Personnalisez l'apparence du document genere</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : config ? (
          <div className="space-y-3 py-2">
            {SECTIONS.map((section) => (
              <SectionAccordion
                key={section.key}
                label={section.label}
                icon={section.icon}
                open={openSections.has(section.key)}
                onToggle={() => toggleSection(section.key)}
              >
                <div className="space-y-3">
                  {section.fields.map((field) => {
                    const sectionData = config[section.key as keyof PdfTemplateConfig] as Record<string, unknown>;
                    const value = sectionData?.[field.key];

                    if (field.type === 'color') {
                      return (
                        <div key={field.key} className="flex items-center gap-3">
                          <input
                            type="color"
                            value={(value as string) || '#000000'}
                            onChange={(e) => updateField(section.key, field.key, e.target.value)}
                            className="h-8 w-10 rounded border border-border cursor-pointer"
                          />
                          <Label className="text-sm flex-1">{field.label}</Label>
                          <code className="text-xs text-muted-foreground font-mono">{value as string}</code>
                        </div>
                      );
                    }

                    if (field.type === 'number') {
                      return (
                        <div key={field.key} className="flex items-center gap-3">
                          <Label className="text-sm w-40 shrink-0">{field.label}</Label>
                          <Input
                            type="number"
                            value={value as number}
                            min={field.min}
                            max={field.max}
                            onChange={(e) => updateField(section.key, field.key, Number(e.target.value))}
                            className="w-24"
                          />
                        </div>
                      );
                    }

                    if (field.type === 'boolean') {
                      return (
                        <div key={field.key} className="flex items-center justify-between">
                          <Label className="text-sm">{field.label}</Label>
                          <Toggle
                            checked={value as boolean}
                            onChange={(v) => updateField(section.key, field.key, v)}
                          />
                        </div>
                      );
                    }

                    // text
                    return (
                      <div key={field.key} className="space-y-1">
                        <Label className="text-sm">{field.label}</Label>
                        <Input
                          value={(value as string) || ''}
                          onChange={(e) => updateField(section.key, field.key, e.target.value)}
                          maxLength={500}
                        />
                      </div>
                    );
                  })}
                </div>
              </SectionAccordion>
            ))}

            {/* Variables reference */}
            {variables.length > 0 && (
              <div className="border border-border rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Variables disponibles</p>
                <div className="flex flex-wrap gap-1.5">
                  {variables.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => copyVariable(v.name)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs font-mono hover:bg-muted-foreground/20 transition-colors"
                      title={v.description}
                    >
                      <Copy className="h-3 w-3" />
                      {`{{${v.name}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving || !config}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset Dialog ────────────────────────────────────────────────────────────

function ResetDialog({
  templateId, open, onClose, onReset,
}: { templateId: string | null; open: boolean; onClose: () => void; onReset: () => void }) {

  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      await api.delete(`/admin/pdf-templates/${templateId}`);
      toast({ title: 'Modele reinitialise' });
      onReset();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Echec de la reinitialisation', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reinitialiser le modele</DialogTitle>
          <DialogDescription>
            Toutes les personnalisations seront perdues. Le modele reviendra a sa configuration par defaut.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reinitialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PdfTemplatesPage() {

  const [templates, setTemplates] = useState<PdfTemplateDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.get<PdfTemplateDefinition[]>('/admin/pdf-templates');
      setTemplates(data);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les modeles PDF', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleExport = async () => {
    try {
      const data = await api.get<{ exportedAt: string; templates: unknown[] }>('/admin/pdf-templates/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pdf-templates-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export reussi' });
    } catch {
      toast({ title: 'Erreur', description: 'Echec de l\'export', variant: 'destructive' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { templates?: { id: string; config: Record<string, unknown> }[] };
      if (!Array.isArray(data?.templates)) {
        toast({ title: 'Erreur', description: 'Format JSON invalide', variant: 'destructive' });
        return;
      }
      const result = await api.post<{ imported: number; skipped: number }>('/admin/pdf-templates/import', data);
      toast({ title: `Import : ${result.imported} modele(s) importe(s), ${result.skipped} ignore(s)` });
      await fetchTemplates();
    } catch {
      toast({ title: 'Erreur', description: 'Echec de l\'import', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const DOC_TYPE_COLORS: Record<string, string> = {
    mise_disposition: 'bg-blue-500',
    restitution: 'bg-violet-500',
    cloture: 'bg-red-500',
    avenant: 'bg-emerald-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Modeles PDF</h1>
          <p className="text-sm text-muted-foreground mt-1">Personnalisez l'apparence des documents PDF generes</p>
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
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center gap-4 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
            >
              {/* Color dot */}
              <div className={`h-3 w-3 rounded-full shrink-0 ${DOC_TYPE_COLORS[tpl.documentType] ?? 'bg-gray-400'}`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{tpl.name}</p>
                  {tpl.isCustomized && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-500">
                      Modifie
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setPreviewTarget(tpl.id)} title="Apercu">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditTarget(tpl.id)} title="Modifier">
                  <Pencil className="h-4 w-4" />
                </Button>
                {tpl.isCustomized && (
                  <Button variant="ghost" size="sm" onClick={() => setResetTarget(tpl.id)} title="Reinitialiser">
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
        templateId={previewTarget}
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
      <EditDialog
        templateId={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={fetchTemplates}
      />
      <ResetDialog
        templateId={resetTarget}
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={fetchTemplates}
      />
    </div>
  );
}
