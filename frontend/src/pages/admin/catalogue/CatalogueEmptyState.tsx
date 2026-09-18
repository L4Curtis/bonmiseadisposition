import { Button } from '@/components/ui/button';
import {
  Plus, Upload, FileDown, SearchX, PackageOpen,
} from 'lucide-react';

interface CatalogueEmptyStateProps {
  variant: 'empty-catalogue' | 'no-results';
  onAddEquipment: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
  onResetFilters: () => void;
}

/** État vide de la table du catalogue : deux cas bien distincts — le
 *  catalogue n'a encore aucun équipement (on propose d'en créer un ou
 *  d'importer un CSV, avec le modèle) contre une recherche/filtre qui ne
 *  retourne rien (on propose de réinitialiser). */
export function CatalogueEmptyState({
  variant, onAddEquipment, onImport, onDownloadTemplate, onResetFilters,
}: CatalogueEmptyStateProps) {
  if (variant === 'no-results') {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <SearchX className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Aucun équipement ne correspond à la recherche</p>
        <Button variant="outline" size="sm" onClick={onResetFilters}>
          Réinitialiser les filtres
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <PackageOpen className="h-8 w-8 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Le catalogue est vide</p>
        <p className="text-sm text-muted-foreground">
          Ajoutez un premier équipement ou importez un fichier CSV pour démarrer.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={onAddEquipment}>
          <Plus className="h-4 w-4" />
          Ajouter un équipement
        </Button>
        <Button variant="outline" size="sm" onClick={onImport}>
          <Upload className="h-4 w-4" />
          Importer un CSV
        </Button>
      </div>
      <button
        type="button"
        onClick={onDownloadTemplate}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
      >
        <FileDown className="h-3.5 w-3.5" />
        Télécharger le modèle CSV
      </button>
    </div>
  );
}
