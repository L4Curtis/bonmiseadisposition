import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Upload, Download, UserPlus } from 'lucide-react';

interface ManualUsersActionsBarProps {
  onAdd: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
  busy: boolean;
}

/** Barre d'actions de la page Utilisateurs (administrateur) : « Ajouter un
 *  collaborateur » reste l'action principale ; import et modèle CSV des
 *  collaborateurs créés à la main sont regroupés dans un menu secondaire,
 *  comme sur la page Filiales. L'export a son bouton (`ManualUsersExportButton`),
 *  qui annonce le contenu du fichier avant de le télécharger. */
export function ManualUsersActionsBar({
  onAdd, onImport, onDownloadTemplate, busy,
}: ManualUsersActionsBarProps) {
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
      <Button onClick={onAdd} className="gap-1.5">
        <UserPlus className="h-4 w-4" />
        Ajouter un collaborateur
      </Button>
    </div>
  );
}
