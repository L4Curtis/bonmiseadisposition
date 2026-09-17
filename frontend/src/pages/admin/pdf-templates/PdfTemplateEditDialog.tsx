import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, Loader2 } from 'lucide-react';
import { PdfTemplateSections } from './PdfTemplateForm';
import { useTemplateConfig } from './useTemplateConfig';

interface PdfTemplateEditDialogProps {
  templateId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PdfTemplateEditDialog({
  templateId, open, onClose, onSaved,
}: PdfTemplateEditDialogProps) {
  const {
    config, variables, loading, saving, openSections,
    toggleSection, updateField, handleSave, copyVariable,
  } = useTemplateConfig(templateId, open, onSaved, onClose);

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
            <PdfTemplateSections
              config={config}
              openSections={openSections}
              onToggleSection={toggleSection}
              onUpdateField={updateField}
            />

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
