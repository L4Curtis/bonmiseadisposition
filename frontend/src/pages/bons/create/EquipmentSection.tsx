import { useEffect, useRef } from 'react';
import { Plus, X, Trash2, Copy, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogSearch } from './CatalogSearch';
import { DuplicateBonButton } from './DuplicateBonButton';
import { splitPastedSerials } from './lib/equipmentLines';
import type { CatalogItem, EquipmentLine, Pack, SerialConflict } from './types';

export interface EquipmentSectionProps {
  readonly equipments: EquipmentLine[];
  readonly allCatalogItems: CatalogItem[];
  readonly packs: Pack[];
  /** Numéros de série (`EquipmentLine._id`) en double DANS le formulaire
   *  courant — signal visuel immédiat, sans appel réseau supplémentaire. */
  readonly duplicateSerialIds: ReadonlySet<string>;
  /** Numéros de série déjà en circulation sur un AUTRE bon, détectés au fil
   *  de la saisie (voir onSerialBlur / useLiveSerialConflicts) — avertissement
   *  non bloquant, distinct du doublon local ci-dessus. */
  readonly liveSerialConflicts: ReadonlyMap<string, SerialConflict[]>;
  readonly onAddFromCatalog: (item: CatalogItem) => void;
  readonly onAddFromPack: (pack: Pack) => void;
  readonly onAddEmptyLine: () => void;
  readonly onRemoveEquipment: (id: string) => void;
  readonly onUpdateEquipment: (id: string, field: keyof EquipmentLine, value: string) => void;
  readonly onDuplicateEquipment: (id: string) => void;
  readonly onPasteSerial: (id: string, text: string) => void;
  /** Sortie du champ N° Série : vérifie les conflits sur un autre bon (à la
   *  volée, throttlé côté hook — voir useLiveSerialConflicts). */
  readonly onSerialBlur: (id: string, value: string) => void;
  readonly onImportDuplicatedEquipments: (lines: EquipmentLine[]) => void;
}

/** Carte « Équipements » : import depuis un pack, un bon existant ou le
 *  catalogue, ajout de lignes vides, duplication d'une ligne et édition des
 *  numéros de série/inventaire/notes (avec collage multi-lignes, repérage des
 *  doublons locaux et des numéros déjà en circulation sur un autre bon).
 *
 *  Lecteur de code-barres : dans le champ N° Série, la touche Entrée duplique
 *  la ligne (même article, sans le numéro de série) et place le curseur dans
 *  le N° Série de la nouvelle ligne — pour enchaîner plusieurs exemplaires
 *  identiques sans lâcher le lecteur ni jamais soumettre le formulaire. */
export function EquipmentSection({
  equipments,
  allCatalogItems,
  packs,
  duplicateSerialIds,
  liveSerialConflicts,
  onAddFromCatalog,
  onAddFromPack,
  onAddEmptyLine,
  onRemoveEquipment,
  onUpdateEquipment,
  onDuplicateEquipment,
  onPasteSerial,
  onSerialBlur,
  onImportDuplicatedEquipments,
}: EquipmentSectionProps) {
  const activePacks = packs.filter((p) => (p as Pack & { active?: boolean }).active !== false);

  // Focus du champ N° Série de la ligne créée par Entrée (voir onKeyDown plus
  // bas) : duplicateLine insère toujours la copie juste après la ligne
  // source, donc l'index cible (pas encore son id, généré ailleurs) suffit.
  const serialInputRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocusIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocusIndexRef.current === null) return;
    const target = equipments[pendingFocusIndexRef.current];
    pendingFocusIndexRef.current = null;
    if (!target) return;
    serialInputRefs.current.get(target._id)?.focus();
  }, [equipments]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Équipements</CardTitle>
          <div className="flex flex-wrap gap-2">
            <DuplicateBonButton onImport={onImportDuplicatedEquipments} />
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
              const liveConflicts = liveSerialConflicts.get(eq._id);
              const hasLiveConflict = !isDuplicateSerial && !!liveConflicts?.length;
              const liveConflictHintId = `live-conflict-${eq._id}`;
              return (
                <div key={eq._id} className="grid grid-cols-[1fr_120px_120px_80px_56px] gap-2 items-center">
                  <div>
                    {eq.catalogItemId ? (
                      <div className="flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-1.5 text-sm">
                        <span className="font-medium text-primary">{eq.catalogItemLabel}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateEquipment(eq._id, 'catalogItemId', '')}
                          className="ml-auto text-primary/50 hover:text-primary"
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
                      ref={(el) => {
                        if (el) serialInputRefs.current.set(eq._id, el);
                        else serialInputRefs.current.delete(eq._id);
                      }}
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
                      onBlur={(e) => onSerialBlur(eq._id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        // Piège à éviter : Entrée dans un champ soumet le
                        // formulaire englobant par défaut — jamais ici, où
                        // Entrée sert au lecteur de code-barres à enchaîner.
                        e.preventDefault();
                        pendingFocusIndexRef.current = i + 1;
                        onDuplicateEquipment(eq._id);
                      }}
                      aria-invalid={isDuplicateSerial || hasLiveConflict || undefined}
                      aria-describedby={
                        isDuplicateSerial ? duplicateHintId : hasLiveConflict ? liveConflictHintId : undefined
                      }
                      title={
                        isDuplicateSerial
                          ? 'Ce numéro de série est déjà utilisé sur une autre ligne de ce bon'
                          : hasLiveConflict
                            ? `Déjà en circulation : ${liveConflicts!.map((c) => c.bonReference).join(', ')}`
                            : undefined
                      }
                      className={`h-8 text-sm ${
                        isDuplicateSerial
                          ? 'border-destructive/60 ring-1 ring-destructive/30 bg-destructive/10'
                          : hasLiveConflict
                            ? 'border-warning/60 ring-1 ring-warning/30 bg-warning/10'
                            : ''
                      }`}
                    />
                    {isDuplicateSerial && (
                      <span id={duplicateHintId} className="sr-only">
                        Ce numéro de série est déjà utilisé sur une autre ligne de ce bon
                      </span>
                    )}
                    {hasLiveConflict && (
                      <span id={liveConflictHintId} role="alert" className="mt-0.5 flex items-start gap-1 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        Déjà en circulation sur {liveConflicts!.map((c) => c.bonReference).join(', ')}
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
                      className="text-muted-foreground/50 hover:text-destructive transition-colors"
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
