import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2 } from 'lucide-react';
import { useEmailTemplates } from './email-templates/useEmailTemplates';
import { EmailTemplateList } from './email-templates/EmailTemplateList';
import { EmailTemplatePreview } from './email-templates/EmailTemplatePreview';
import { EmailTemplateEditor } from './email-templates/EmailTemplateEditor';
import { EmailTemplateResetDialog } from './email-templates/EmailTemplateResetDialog';

// ─── Main Page ───────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const {
    templates, loading, importing, fileInputRef,
    fetchTemplates, handleExport, handleImport,
    previewTarget, setPreviewTarget,
    editTarget, setEditTarget,
    resetTarget, setResetTarget,
  } = useEmailTemplates();

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
      <EmailTemplateList
        templates={templates}
        loading={loading}
        onPreview={setPreviewTarget}
        onEdit={setEditTarget}
        onReset={setResetTarget}
      />

      {/* Dialogs */}
      <EmailTemplatePreview
        template={previewTarget}
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
      <EmailTemplateEditor
        template={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={fetchTemplates}
      />
      <EmailTemplateResetDialog
        template={resetTarget}
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={fetchTemplates}
      />
    </div>
  );
}
