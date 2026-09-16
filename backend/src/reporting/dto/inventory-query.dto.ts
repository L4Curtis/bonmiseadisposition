import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EquipmentCategory } from '@prisma/client';

/** Champs de tri supportés par GET /reporting/inventory. */
export const INVENTORY_SORT_FIELDS = ['collaborateur', 'category', 'dateMiseDisposition'] as const;
export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];

/** Query DTO commun à la liste paginée et à l'export CSV de l'inventaire du
 *  parc prêté (mêmes filtres, cf. InventoryService.buildWhere). */
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
}
