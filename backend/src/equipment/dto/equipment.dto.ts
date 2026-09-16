import { IsString, IsEnum, IsOptional, IsBoolean, IsInt, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum EquipmentCategoryEnum {
  pc_portable = 'pc_portable',
  pc_fixe = 'pc_fixe',
  ecran = 'ecran',
  souris = 'souris',
  clavier = 'clavier',
  casque = 'casque',
  telephone = 'telephone',
  housse = 'housse',
  dock = 'dock',
  cable = 'cable',
  autre = 'autre',
}

export class CreateCatalogItemDto {
  @IsEnum(EquipmentCategoryEnum)
  category!: EquipmentCategoryEnum;

  @IsString()
  brand!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCatalogItemDto {
  @IsOptional()
  @IsEnum(EquipmentCategoryEnum)
  category?: EquipmentCategoryEnum;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // `active` reste accepté ici (le frontend réactive via PUT { active: true })
  // mais equipment.service#updateCatalogItem applique, pour une transition
  // true → false, exactement la même garde que removeCatalogItem : sinon un
  // simple PUT contournerait la vérification « référencé sur N bons/packs
  // actifs ». La réactivation (false → true) reste libre.
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PackItemDto {
  @IsString()
  catalogItemId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreatePackDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackItemDto)
  items?: PackItemDto[];
}

export class UpdatePackDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackItemDto)
  items?: PackItemDto[];
}
