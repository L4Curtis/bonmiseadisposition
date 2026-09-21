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
 *  QueryBonsDto.overdue. Exportée pour être réutilisée telle quelle par
 *  InventoryByCollaborateurQueryDto (voir inventory-by-collaborateur-query.dto.ts). */
export const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return value;
};

/** Recadre une chaîne de recherche — exportée pour la même raison que `toBoolean`. */
export const trimSearch = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Filtre sur l'état du compte du collaborateur (`User.active`) — porté
 *  uniquement par `InventoryByCollaborateurQueryDto` (cf. plus bas) : filtrer
 *  la vue par équipement sur ce critère n'a pas d'usage identifié pour
 *  l'instant. Déclaré ici (fichier « base ») pour éviter un cycle d'import
 *  avec inventory-by-collaborateur-query.dto.ts, qui importe déjà de ce
 *  fichier (toBoolean, trimSearch). */
export const COMPTE_FILTER_VALUES = ['actif', 'inactif'] as const;
export type CompteFilter = (typeof COMPTE_FILTER_VALUES)[number];

/**
 * Champs de filtrage communs à `GET /reporting/inventory` et
 * `GET /reporting/inventory/by-collaborateur` : c'est le contrat implicite de
 * `InventoryService.buildWhere`, qui n'en lit jamais d'autres. Les deux DTOs
 * (`InventoryQueryDto` ci-dessous et `InventoryByCollaborateurQueryDto`)
 * implémentent cette interface, ce qui permet à `buildWhere` de rester
 * strictement typé sans dépendre d'un DTO en particulier — et donc d'être
 * appelé sans duplication depuis les deux routes.
 */
export interface InventoryWhereFilters {
  filialeId?: string;
  category?: EquipmentCategory;
  collaborateurId?: string;
  situation?: EquipmentSituation;
  overdue?: boolean;
  search?: string;
  /** cf. COMPTE_FILTER_VALUES — seule InventoryByCollaborateurQueryDto le déclare. */
  compte?: CompteFilter;
}

/** Query DTO commun à la liste paginée et à l'export CSV de l'inventaire du
 *  parc en circulation (mêmes filtres, cf. InventoryService.buildWhere). */
export class InventoryQueryDto implements InventoryWhereFilters {
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
  @Transform(trimSearch)
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
