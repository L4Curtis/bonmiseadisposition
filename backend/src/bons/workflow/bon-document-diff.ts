import { UpdateBonDto } from '../dto/bon.dto';
import { normalizeEquipmentInput } from '../validation/bon-validators';
import { blankToNull } from './bon-crud';

/**
 * Ce qu'une modification change dans le DOCUMENT du bon, celui que le
 * collaborateur signe (PDF, page de signature). La « Note interne IT » n'y
 * figure pas : la modifier seule ne doit ni invalider le lien envoyé, ni
 * redemander la signature IT (module pur).
 */

/** Bon tel qu'il est avant la modification (colonnes du document). */
export interface DocumentState {
  readonly filialeId: string;
  readonly collaborateurId: string;
  readonly civilite: string | null;
  readonly dateMiseDisposition: Date;
  readonly dateRestitution: Date | null;
  readonly notes: string | null;
  readonly equipments: readonly {
    readonly catalogItemId: string | null;
    readonly customLabel: string | null;
    readonly serialNumber: string | null;
    readonly inventoryNumber: string | null;
    readonly notes: string | null;
  }[];
}

const isoDay = (value: Date | null): string | null => (value ? new Date(value).toISOString().slice(0, 10) : null);

/** Empreinte comparable d'une ligne d'équipement (ordre du bon compris). */
function equipmentKey(e: DocumentState['equipments'][number]): string {
  return JSON.stringify([e.catalogItemId ?? null, e.customLabel ?? null, e.serialNumber ?? null, e.inventoryNumber ?? null, e.notes ?? null]);
}

function equipmentsChanged(bon: DocumentState, dto: UpdateBonDto): boolean {
  if (dto.equipments === undefined) return false;
  const next = dto.equipments.map((e, idx) => equipmentKey(normalizeEquipmentInput(e, idx)));
  const current = bon.equipments.map(equipmentKey);
  return next.length !== current.length || next.some((key, idx) => key !== current[idx]);
}

/** Noms des champs du document que la modification change réellement. */
export function documentChanges(bon: DocumentState, dto: UpdateBonDto): string[] {
  const checks: ReadonlyArray<readonly [string, boolean]> = [
    ['filialeId', dto.filialeId !== undefined && dto.filialeId !== bon.filialeId],
    ['collaborateurId', dto.collaborateurId !== undefined && dto.collaborateurId !== bon.collaborateurId],
    ['civilite', dto.civilite !== undefined && dto.civilite !== bon.civilite],
    [
      'dateMiseDisposition',
      dto.dateMiseDisposition !== undefined && dto.dateMiseDisposition !== isoDay(bon.dateMiseDisposition),
    ],
    [
      'dateRestitution',
      dto.dateRestitution !== undefined && (dto.dateRestitution || null) !== isoDay(bon.dateRestitution),
    ],
    ['notes', dto.notes !== undefined && blankToNull(dto.notes) !== (bon.notes ?? null)],
    ['equipments', equipmentsChanged(bon, dto)],
  ];
  return checks.filter(([, changed]) => changed).map(([field]) => field);
}
