import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2 } from 'lucide-react';
import { useEmailTemplates } from './email-templates/useEmailTemplates';
import { useEmailTemplateFilters } from './email-templates/useEmailTemplateFilters';
import { EmailTemplateFilters } from './email-templates/EmailTemplateFilters';
import { EmailTemplateList } from './email-templates/EmailTemplateList';
import { EmailTemplatePreview } from './email-templates/EmailTemplatePreview';
import { EmailTemplateEditor } from './email-templates/EmailTemplateEditor';
import { EmailTemplateResetDialog } from './email-templates/EmailTemplateResetDialog';
import { EmailTemplateTestDialog } from './email-templates/EmailTemplateTestDialog';

// ─── Main Page ───────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const {
    templates, loading, importing, fileInputRef,
    fetchTemplates, handleExport, handleImport,
    previewTarget, setPreviewTarget,
    editTarget, setEditTarget,
    resetTarget, setResetTarget,
    testTarget, setTestTarget,
  } = useEmailTemplates();

  const {
    searchInput, setSearchInput, categoryFilter, setCategoryFilter,
    recipientFilter, setRecipientFilter, recipients,
    filteredTemplates, hasActiveFilters, resetFilters,
  } = useEmailTemplateFilters(templates);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Modèles d'emails</h1>
          <p className="text-sm text-muted-foreground mt-1">Personnalisez les emails automatiques envoyés par l'application</p>
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

      {/* Filtres */}
      <EmailTemplateFilters
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        recipientFilter={recipientFilter}
        onRecipientFilterChange={setRecipientFilter}
        recipients={recipients}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />

      {/* Template list */}
      <EmailTemplateList
        templates={filteredTemplates}
        totalCount={templates.length}
        loading={loading}
        onPreview={setPreviewTarget}
        onEdit={setEditTarget}
        onReset={setResetTarget}
        onTest={setTestTarget}
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
      <EmailTemplateTestDialog
        template={testTarget}
        open={!!testTarget}
        onClose={() => setTestTarget(null)}
      />
    </div>
  );
}
