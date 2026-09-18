import {
  IsString, IsEnum, IsOptional, IsBoolean, IsInt, IsArray, ValidateNested, Min, Max,
  IsUUID, IsNotEmpty, MaxLength, ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { trimTransform, trimToUndefinedTransform } from './transforms';

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

// Bornes cohérentes avec la colonne (TEXT en base, mais une marque/un modèle
// de plusieurs centaines de caractères est toujours une erreur de saisie) et
// avec le PDF généré (la mise en page du bon suppose des libellés courts).
const BRAND_MODEL_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const PACK_NAME_MAX_LENGTH = 100;
const IMPORT_MAX_ITEMS = 500;

export class CreateCatalogItemDto {
  @IsEnum(EquipmentCategoryEnum)
  category!: EquipmentCategoryEnum;

  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'La marque ne peut pas être vide.' })
  @MaxLength(BRAND_MODEL_MAX_LENGTH, { message: `La marque ne doit pas dépasser ${BRAND_MODEL_MAX_LENGTH} caractères.` })
  brand!: string;

  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le modèle ne peut pas être vide.' })
  @MaxLength(BRAND_MODEL_MAX_LENGTH, { message: `Le modèle ne doit pas dépasser ${BRAND_MODEL_MAX_LENGTH} caractères.` })
  model!: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(DESCRIPTION_MAX_LENGTH, { message: `La description ne doit pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères.` })
  description?: string;
}

export class UpdateCatalogItemDto {
  @IsOptional()
  @IsEnum(EquipmentCategoryEnum)
  category?: EquipmentCategoryEnum;

  @IsOptional()
  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'La marque ne peut pas être vide.' })
  @MaxLength(BRAND_MODEL_MAX_LENGTH, { message: `La marque ne doit pas dépasser ${BRAND_MODEL_MAX_LENGTH} caractères.` })
  brand?: string;

  @IsOptional()
  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le modèle ne peut pas être vide.' })
  @MaxLength(BRAND_MODEL_MAX_LENGTH, { message: `Le modèle ne doit pas dépasser ${BRAND_MODEL_MAX_LENGTH} caractères.` })
  model?: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(DESCRIPTION_MAX_LENGTH, { message: `La description ne doit pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères.` })
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
  @IsUUID('4', { message: 'catalogItemId doit être un UUID valide' })
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
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le nom du pack ne peut pas être vide.' })
  @MaxLength(PACK_NAME_MAX_LENGTH, { message: `Le nom du pack ne doit pas dépasser ${PACK_NAME_MAX_LENGTH} caractères.` })
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(DESCRIPTION_MAX_LENGTH, { message: `La description ne doit pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères.` })
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
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le nom du pack ne peut pas être vide.' })
  @MaxLength(PACK_NAME_MAX_LENGTH, { message: `Le nom du pack ne doit pas dépasser ${PACK_NAME_MAX_LENGTH} caractères.` })
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(DESCRIPTION_MAX_LENGTH, { message: `La description ne doit pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères.` })
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

// ── Import en masse du catalogue ────────────────────────────────────────
//
// Le contrat (POST /equipment/catalog/import) exige qu'une ligne invalide
// devienne une entrée dans `errors` SANS interrompre le reste de l'import.
// `ImportCatalogItemDto` sert donc à valider CHAQUE ligne manuellement dans
// EquipmentService (plainToInstance + validate), et non via un
// `@ValidateNested()` global sur `ImportCatalogDto.items` : ce dernier
// ferait échouer toute la requête (400) dès la première ligne invalide,
// contrairement au contrat attendu.

export class ImportCatalogItemDto {
  @IsEnum(EquipmentCategoryEnum, { message: 'category doit être une valeur valide du catalogue.' })
  category!: EquipmentCategoryEnum;

  @IsString({ message: 'brand est requis.' })
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'La marque ne peut pas être vide.' })
  @MaxLength(BRAND_MODEL_MAX_LENGTH, { message: `La marque ne doit pas dépasser ${BRAND_MODEL_MAX_LENGTH} caractères.` })
  brand!: string;

  @IsString({ message: 'model est requis.' })
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le modèle ne peut pas être vide.' })
  @MaxLength(BRAND_MODEL_MAX_LENGTH, { message: `Le modèle ne doit pas dépasser ${BRAND_MODEL_MAX_LENGTH} caractères.` })
  model!: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(DESCRIPTION_MAX_LENGTH, { message: `La description ne doit pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères.` })
  description?: string;
}

export class ImportCatalogDto {
  @IsArray({ message: 'items doit être un tableau.' })
  @ArrayMaxSize(IMPORT_MAX_ITEMS, { message: `Un import ne peut pas contenir plus de ${IMPORT_MAX_ITEMS} articles.` })
  items!: unknown[];
}

export interface ImportCatalogError {
  index: number;
  message: string;
}

export interface ImportCatalogResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportCatalogError[];
}
