import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EquipmentCategory } from '@prisma/client';
import { EquipmentSituation, SITUATION_ORDER } from '../../common/bon-predicates';

/** Champs de tri supportés par GET /reporting/inventory. */
export const INVENTORY_SORT_FIELDS = ['collaborateur', 'category', 'dateMiseDisposition'] as const;
export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];

/** Sens de tri appliqué au champ `sort` — indépendant du champ pour permettre
 *  à la colonne « Mise à disposition » (ancienneté) d'être triée dans les
 *  deux sens depuis le tableau. */
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Accepte les graphies usuelles des booléens en query string : '1', 'true'
 *  (indépendamment de la casse), ou un booléen réel — même convention que
 *  QueryBonsDto.overdue. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return value;
};

/** Query DTO commun à la liste paginée et à l'export CSV de l'inventaire du
 *  parc en circulation (mêmes filtres, cf. InventoryService.buildWhere). */
export class InventoryQueryDto {
  @IsOptional()
  @IsUUID()
  filialeId?: string;

  @IsOptional()
  @IsIn(Object.values(EquipmentCategory))
  category?: EquipmentCategory;

  @IsOptional()
  @IsUUID()
  collaborateurId?: string;

  /** Filtre optionnel sur la situation de l'équipement (cf. bon-predicates.ts) —
   *  en_attente_signature / en_circulation / en_litige. */
  @IsOptional()
  @IsIn(SITUATION_ORDER)
  situation?: EquipmentSituation;

  /** Filtre « en retard de restitution » (dateRestitution < aujourd'hui,
   *  Europe/Paris) — indépendant de `situation` : un équipement en_circulation
   *  ou en_litige peut être en retard. Alimente la tuile cliquable « En retard
   *  de restitution » de l'inventaire. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(INVENTORY_SORT_FIELDS)
  sort?: InventorySortField;

  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  direction?: SortDirection;
}
