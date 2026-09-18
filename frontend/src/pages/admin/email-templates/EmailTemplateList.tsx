import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Eye, Pencil, RotateCcw, Send,
} from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './types';
import type { TemplateDefinition } from './types';

interface EmailTemplateListProps {
  templates: TemplateDefinition[];
  totalCount: number;
  loading: boolean;
  onPreview: (template: TemplateDefinition) => void;
  onEdit: (template: TemplateDefinition) => void;
  onReset: (template: TemplateDefinition) => void;
  onTest: (template: TemplateDefinition) => void;
}

export function EmailTemplateList({
  templates, totalCount, loading, onPreview, onEdit, onReset, onTest,
}: EmailTemplateListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg py-10 text-center text-sm text-muted-foreground">
        {totalCount === 0
          ? 'Aucun modèle disponible.'
          : 'Aucun modèle ne correspond à votre recherche ou aux filtres sélectionnés.'}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
      {templates.map((tpl) => {
        const categoryLabel = CATEGORY_LABELS[tpl.category] ?? tpl.category;
        return (
          <div
            key={tpl.id}
            className="flex items-center gap-4 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
          >
            {/* Pastille de catégorie — décorative, le libellé est porté par le badge adjacent */}
            <div
              className={`h-3 w-3 rounded-full shrink-0 ${CATEGORY_COLORS[tpl.category] ?? 'bg-muted-foreground/40'}`}
              aria-hidden="true"
              title={categoryLabel}
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{tpl.name}</p>
                {tpl.isCustomized && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning/40 text-warning">
                    Personnalisé
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {categoryLabel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>
            </div>

            {/* Recipient */}
            <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{tpl.recipient}</span>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => onPreview(tpl)} title="Aperçu">
                <Eye className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onEdit(tpl)} title="Modifier">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onTest(tpl)} title="Envoyer un test">
                <Send className="h-4 w-4" />
              </Button>
              {tpl.isCustomized && (
                <Button variant="ghost" size="sm" onClick={() => onReset(tpl)} title="Réinitialiser">
                  <RotateCcw className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
