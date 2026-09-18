import { Plus, X, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogSearch } from './CatalogSearch';
import { splitPastedSerials } from './lib/equipmentLines';
import type { CatalogItem, EquipmentLine, Pack } from './types';

export interface EquipmentSectionProps {
  readonly equipments: EquipmentLine[];
  readonly allCatalogItems: CatalogItem[];
  readonly packs: Pack[];
  /** Numéros de série (`EquipmentLine._id`) en double DANS le formulaire
   *  courant — signal visuel immédiat, sans appel réseau supplémentaire. */
  readonly duplicateSerialIds: ReadonlySet<string>;
  readonly onAddFromCatalog: (item: CatalogItem) => void;
  readonly onAddFromPack: (pack: Pack) => void;
  readonly onAddEmptyLine: () => void;
  readonly onRemoveEquipment: (id: string) => void;
  readonly onUpdateEquipment: (id: string, field: keyof EquipmentLine, value: string) => void;
  readonly onDuplicateEquipment: (id: string) => void;
  readonly onPasteSerial: (id: string, text: string) => void;
}

/** Carte « Équipements » : import depuis un pack ou le catalogue, ajout de
 *  lignes vides, duplication d'une ligne et édition des numéros de
 *  série/inventaire/notes (avec collage multi-lignes sur le numéro de série
 *  et repérage des doublons locaux). */
export function EquipmentSection({
  equipments,
  allCatalogItems,
  packs,
  duplicateSerialIds,
  onAddFromCatalog,
  onAddFromPack,
  onAddEmptyLine,
  onRemoveEquipment,
  onUpdateEquipment,
  onDuplicateEquipment,
  onPasteSerial,
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
                aria-label="Importer un pack d'équipements"
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
            <div className="grid grid-cols-[1fr_120px_120px_80px_56px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Désignation</span>
              <span>N° Série</span>
              <span>N° Inventaire</span>
              <span>Notes</span>
              <span />
            </div>
            {equipments.map((eq, i) => {
              const rowLabel = i + 1;
              const isDuplicateSerial = duplicateSerialIds.has(eq._id);
              const duplicateHintId = `dup-serial-${eq._id}`;
              return (
                <div key={eq._id} className="grid grid-cols-[1fr_120px_120px_80px_56px] gap-2 items-center">
                  <div>
                    {eq.catalogItemId ? (
                      <div className="flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-2 py-1.5 text-sm">
                        <span className="font-medium text-blue-800 dark:text-blue-200">{eq.catalogItemLabel}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateEquipment(eq._id, 'catalogItemId', '')}
                          className="ml-auto text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300"
                          aria-label={`Retirer cet article du catalogue - ligne ${rowLabel}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <Input
                        placeholder="Libellé personnalisé"
                        aria-label={`Désignation personnalisée - ligne ${rowLabel}`}
                        value={eq.customLabel || ''}
                        onChange={(e) => onUpdateEquipment(eq._id, 'customLabel', e.target.value)}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="SN-XXXXX"
                      aria-label={`Numéro de série - ligne ${rowLabel}`}
                      value={eq.serialNumber || ''}
                      onChange={(e) => onUpdateEquipment(eq._id, 'serialNumber', e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text');
                        if (splitPastedSerials(text).length > 1) {
                          e.preventDefault();
                          onPasteSerial(eq._id, text);
                        }
                      }}
                      aria-invalid={isDuplicateSerial || undefined}
                      aria-describedby={isDuplicateSerial ? duplicateHintId : undefined}
                      title={isDuplicateSerial ? 'Ce numéro de série est déjà utilisé sur une autre ligne de ce bon' : undefined}
                      className={`h-8 text-sm ${
                        isDuplicateSerial
                          ? 'border-red-400 dark:border-red-700 ring-1 ring-red-300 dark:ring-red-800 bg-red-50/60 dark:bg-red-900/10'
                          : ''
                      }`}
                    />
                    {isDuplicateSerial && (
                      <span id={duplicateHintId} className="sr-only">
                        Ce numéro de série est déjà utilisé sur une autre ligne de ce bon
                      </span>
                    )}
                  </div>
                  <Input
                    placeholder="INV-XXXXX"
                    aria-label={`Numéro d'inventaire - ligne ${rowLabel}`}
                    value={eq.inventoryNumber || ''}
                    onChange={(e) => onUpdateEquipment(eq._id, 'inventoryNumber', e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="..."
                    aria-label={`Notes - ligne ${rowLabel}`}
                    value={eq.notes || ''}
                    onChange={(e) => onUpdateEquipment(eq._id, 'notes', e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onDuplicateEquipment(eq._id)}
                      className="text-muted-foreground/50 hover:text-primary transition-colors"
                      aria-label={`Dupliquer la ligne ${rowLabel}`}
                      title="Dupliquer la ligne"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveEquipment(eq._id)}
                      className="text-muted-foreground/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      aria-label={`Supprimer la ligne ${rowLabel}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
