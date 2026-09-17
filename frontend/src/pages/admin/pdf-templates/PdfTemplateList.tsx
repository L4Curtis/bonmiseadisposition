import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Pencil, RotateCcw } from 'lucide-react';
import { DOC_TYPE_COLORS } from './types';
import type { PdfTemplateDefinition } from './types';

interface PdfTemplateListProps {
  templates: PdfTemplateDefinition[];
  loading: boolean;
  onPreview: (id: string) => void;
  onEdit: (id: string) => void;
  onReset: (id: string) => void;
}

export function PdfTemplateList({
  templates, loading, onPreview, onEdit, onReset,
}: PdfTemplateListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
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
            <Button variant="ghost" size="sm" onClick={() => onPreview(tpl.id)} title="Apercu">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(tpl.id)} title="Modifier">
              <Pencil className="h-4 w-4" />
            </Button>
            {tpl.isCustomized && (
              <Button variant="ghost" size="sm" onClick={() => onReset(tpl.id)} title="Reinitialiser">
                <RotateCcw className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
