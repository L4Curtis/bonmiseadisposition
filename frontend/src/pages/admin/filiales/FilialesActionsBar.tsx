import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, MoreHorizontal, Upload, Download, FileDown,
} from 'lucide-react';

interface FilialesActionsBarProps {
  onAdd: () => void;
  onImport: () => void;
  onExportCsv: () => void;
  onExportCsvWithImages: () => void;
  onDownloadTemplate: () => void;
  busy: boolean;
}

/** Barre d'actions de la page Filiales : « Ajouter une filiale » est l'action
 *  principale. Import CSV, export (avec ou sans images) et modèle sont
 *  regroupés dans un menu secondaire pour ne pas concurrencer l'action
 *  principale. */
export function FilialesActionsBar({
  onAdd, onImport, onExportCsv, onExportCsvWithImages, onDownloadTemplate, busy,
}: FilialesActionsBarProps) {
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy}>
            <MoreHorizontal className="h-4 w-4" />
            Autres actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onImport}>
            <Upload className="h-4 w-4" />
            Importer un CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onExportCsv}>
            <Download className="h-4 w-4" />
            Exporter CSV
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExportCsvWithImages} className="flex-col items-start gap-0.5">
            <span className="flex items-center gap-2">
              <FileDown className="h-4 w-4" />
              Exporter CSV avec images
            </span>
            <span className="pl-6 text-xs text-muted-foreground">
              Fichier volumineux (logos et cachets encodés)
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDownloadTemplate}>
            <Download className="h-4 w-4" />
            Télécharger un modèle
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Ajouter une filiale
      </Button>
    </div>
  );
}
