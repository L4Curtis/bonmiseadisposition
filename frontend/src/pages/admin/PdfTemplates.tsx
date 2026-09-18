import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2 } from 'lucide-react';
import { usePdfTemplates } from './pdf-templates/usePdfTemplates';
import { PdfTemplateList } from './pdf-templates/PdfTemplateList';
import { PdfTemplatePreview } from './pdf-templates/PdfTemplatePreview';
import { PdfTemplateEditDialog } from './pdf-templates/PdfTemplateEditDialog';
import { PdfTemplateResetDialog } from './pdf-templates/PdfTemplateResetDialog';

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PdfTemplatesPage() {
  const {
    templates, loading, importing, fileInputRef,
    fetchTemplates, handleExport, handleImport,
    previewTarget, setPreviewTarget,
    editTarget, setEditTarget,
    resetTarget, setResetTarget,
  } = usePdfTemplates();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Modèles PDF</h1>
          <p className="text-sm text-muted-foreground mt-1">Personnalisez l'apparence des documents PDF générés</p>
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
      <PdfTemplateList
        templates={templates}
        loading={loading}
        onPreview={setPreviewTarget}
        onEdit={setEditTarget}
        onReset={setResetTarget}
      />

      {/* Dialogs */}
      <PdfTemplatePreview
        templateId={previewTarget}
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
      <PdfTemplateEditDialog
        templateId={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={fetchTemplates}
      />
      <PdfTemplateResetDialog
        templateId={resetTarget}
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={fetchTemplates}
      />
    </div>
  );
}
