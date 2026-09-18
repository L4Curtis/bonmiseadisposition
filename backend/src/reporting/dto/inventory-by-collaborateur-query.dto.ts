import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EquipmentCategory } from '@prisma/client';
import { EquipmentSituation, SITUATION_ORDER } from '../../common/bon-predicates';
import { InventoryWhereFilters, toBoolean, trimSearch } from './inventory-query.dto';

/** Tri du regroupement par collaborateur : `count` (défaut, nombre
 *  d'équipements décroissant) ou `oldest` (prêt le plus ancien d'abord). Voir
 *  inventory-collaborateur-aggregate.ts pour le calcul effectif. */
export const COLLABORATEUR_SORT_FIELDS = ['count', 'oldest'] as const;
export type CollaborateurSortField = (typeof COLLABORATEUR_SORT_FIELDS)[number];

/**
 * Query DTO de `GET /reporting/inventory/by-collaborateur` — exactement les
 * mêmes filtres que `InventoryQueryDto` (implémente la même interface
 * `InventoryWhereFilters`, réutilisée sans modification par
 * `InventoryService.buildWhere`), à l'exception de `collaborateurId` (filtrer
 * un regroupement par collaborateur sur un seul collaborateur n'a pas de sens)
 * et du champ de tri, propre à cette vue.
 */
export class InventoryByCollaborateurQueryDto implements InventoryWhereFilters {
  @IsOptional()
  @IsUUID()
  filialeId?: string;

  @IsOptional()
  @IsIn(Object.values(EquipmentCategory))
  category?: EquipmentCategory;

  @IsOptional()
  @IsIn(SITUATION_ORDER)
  situation?: EquipmentSituation;

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
  @IsIn(COLLABORATEUR_SORT_FIELDS)
  sort?: CollaborateurSortField;
}
