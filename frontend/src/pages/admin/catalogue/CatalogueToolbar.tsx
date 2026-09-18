import { Button } from '@/components/ui/button';
import {
  Upload, Download, FileDown, Plus,
} from 'lucide-react';

interface CatalogueToolbarProps {
  onAddEquipment: () => void;
  onImport: () => void;
  onExport: () => void;
  exportDisabled: boolean;
  onDownloadTemplate: () => void;
}

/** Actions du catalogue, groupées par importance : le modèle CSV et l'import/
 *  export restent discrets (ghost/outline) pour ne pas concurrencer
 *  visuellement l'action principale « Ajouter un équipement » (bouton plein,
 *  à droite). */
export function CatalogueToolbar({
  onAddEquipment, onImport, onExport, exportDisabled, onDownloadTemplate,
}: CatalogueToolbarProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={onDownloadTemplate}>
        <FileDown className="h-4 w-4" />
        Modèle CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onImport}>
        <Upload className="h-4 w-4" />
        Importer un CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onExport} disabled={exportDisabled}>
        <Download className="h-4 w-4" />
        Exporter CSV
      </Button>
      <Button type="button" size="sm" onClick={onAddEquipment} className="ml-1">
        <Plus className="h-4 w-4" />
        Ajouter un équipement
      </Button>
    </div>
  );
}
