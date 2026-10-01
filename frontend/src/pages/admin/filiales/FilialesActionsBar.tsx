import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Upload, Download } from 'lucide-react';

interface FilialesActionsBarProps {
  onAdd: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
  busy: boolean;
}

/** Barre d'actions de la page Filiales : « Ajouter une filiale » est l'action
 *  principale. Import CSV et modèle sont regroupés dans un menu secondaire ;
 *  les exports ont leurs boutons (`FilialesExportButtons`), qui annoncent le
 *  contenu du fichier avant de le télécharger. */
export function FilialesActionsBar({
  onAdd, onImport, onDownloadTemplate, busy,
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
