import { Plus, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogSearch } from './CatalogSearch';
import type { CatalogItem, EquipmentLine, Pack } from './types';

export interface EquipmentSectionProps {
  readonly equipments: EquipmentLine[];
  readonly allCatalogItems: CatalogItem[];
  readonly packs: Pack[];
  readonly onAddFromCatalog: (item: CatalogItem) => void;
  readonly onAddFromPack: (pack: Pack) => void;
  readonly onAddEmptyLine: () => void;
  readonly onRemoveEquipment: (id: string) => void;
  readonly onUpdateEquipment: (id: string, field: keyof EquipmentLine, value: string) => void;
}

/** Carte « Équipements » : import depuis un pack ou le catalogue, ajout de
 *  lignes vides, et édition des numéros de série/inventaire/notes. */
export function EquipmentSection({
  equipments,
  allCatalogItems,
  packs,
  onAddFromCatalog,
  onAddFromPack,
  onAddEmptyLine,
  onRemoveEquipment,
  onUpdateEquipment,
}: EquipmentSectionProps) {
  const activePacks = packs.filter((p) => (p as Pack & { active?: boolean }).active !== false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Équipements</CardTitle>
          <div className="flex gap-2">
            {/* Import depuis pack */}
            {activePacks.length > 0 && (
              <select
                className="field-modern h-8 px-2 text-xs cursor-pointer"
                value=""
                onChange={(e) => {
                  const pack = packs.find((p) => p.id === e.target.value);
                  if (pack) onAddFromPack(pack);
                }}
              >
                <option value="">Importer un pack...</option>
                {activePacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddEmptyLine}
            >
              <Plus className="h-3.5 w-3.5" /> Ligne vide
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <CatalogSearch allItems={allCatalogItems} onAdd={onAddFromCatalog} />

        {equipments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground/70 py-4">Aucun équipement ajouté</p>
        ) : (
          <div className="mt-2 space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_120px_80px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Désignation</span>
              <span>N° Série</span>
              <span>N° Inventaire</span>
              <span>Notes</span>
              <span />
            </div>
            {equipments.map((eq) => (
              <div key={eq._id} className="grid grid-cols-[1fr_120px_120px_80px_32px] gap-2 items-center">
                <div>
                  {eq.catalogItemId ? (
                    <div className="flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-2 py-1.5 text-sm">
                      <span className="font-medium text-blue-800 dark:text-blue-200">{eq.catalogItemLabel}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateEquipment(eq._id, 'catalogItemId', '')}
                        className="ml-auto text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300"
                        aria-label="Retirer cet article du catalogue"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Input
                      placeholder="Libellé personnalisé"
                      value={eq.customLabel || ''}
                      onChange={(e) => onUpdateEquipment(eq._id, 'customLabel', e.target.value)}
                      className="h-8 text-sm"
                    />
                  )}
                </div>
                <Input
                  placeholder="SN-XXXXX"
                  value={eq.serialNumber || ''}
                  onChange={(e) => onUpdateEquipment(eq._id, 'serialNumber', e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="INV-XXXXX"
                  value={eq.inventoryNumber || ''}
                  onChange={(e) => onUpdateEquipment(eq._id, 'inventoryNumber', e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="..."
                  value={eq.notes || ''}
                  onChange={(e) => onUpdateEquipment(eq._id, 'notes', e.target.value)}
                  className="h-8 text-sm"
                />
                <button
                  type="button"
                  onClick={() => onRemoveEquipment(eq._id)}
                  className="text-muted-foreground/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  aria-label="Supprimer cet équipement"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
