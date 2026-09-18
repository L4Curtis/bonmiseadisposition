import { Button } from '@/components/ui/button';
import { Upload, Download } from 'lucide-react';

interface CatalogueToolbarProps {
  onImport: () => void;
  onExport: () => void;
  exportDisabled: boolean;
}

/** Actions globales du catalogue : import CSV en masse et export du catalogue
 *  actuellement affiché (recherche/filtre appliqués). */
export function CatalogueToolbar({ onImport, onExport, exportDisabled }: CatalogueToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onImport}>
        <Upload className="h-4 w-4" />
        Importer un CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onExport} disabled={exportDisabled}>
        <Download className="h-4 w-4" />
        Exporter CSV
      </Button>
    </div>
  );
}
