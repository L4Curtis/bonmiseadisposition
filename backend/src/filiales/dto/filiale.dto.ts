import {
  IsString, IsOptional, IsBoolean, IsArray, IsNotEmpty, MaxLength, ArrayMaxSize,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { trimTransform, trimToUndefinedTransform } from './transforms';

export class CreateFilialeDto {
  @IsString()
  name!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  siret?: string;
}

export class UpdateFilialeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  siret?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// ── Import en masse (POST /filiales/import) ───────────────────────────────
//
// Même principe que equipment/dto/equipment.dto.ts#ImportCatalogItemDto :
// `ImportFilialesDto.items` reste `unknown[]` (pas de `@ValidateNested()`
// global) pour qu'une ligne invalide devienne une entrée dans `errors` SANS
// faire échouer (400) la requête entière — chaque ligne est validée
// manuellement dans filiales-import.ts via plainToInstance + validate.

const FILIALE_NAME_MAX_LENGTH = 100;
const FILIALE_ADDRESS_MAX_LENGTH = 255;
const FILIALE_SIRET_MAX_LENGTH = 50;
const IMPORT_FILIALES_MAX_ITEMS = 200;

export class ImportFilialeItemDto {
  @IsString({ message: 'name est requis.' })
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le nom ne peut pas être vide.' })
  @MaxLength(FILIALE_NAME_MAX_LENGTH, { message: `Le nom ne doit pas dépasser ${FILIALE_NAME_MAX_LENGTH} caractères.` })
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(FILIALE_NAME_MAX_LENGTH, { message: `Le nom affiché ne doit pas dépasser ${FILIALE_NAME_MAX_LENGTH} caractères.` })
  displayName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(FILIALE_ADDRESS_MAX_LENGTH, { message: `L'adresse ne doit pas dépasser ${FILIALE_ADDRESS_MAX_LENGTH} caractères.` })
  address?: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefinedTransform)
  @MaxLength(FILIALE_SIRET_MAX_LENGTH, { message: `Le SIRET ne doit pas dépasser ${FILIALE_SIRET_MAX_LENGTH} caractères.` })
  siret?: string;

  @IsOptional()
  @IsBoolean({ message: 'active doit être un booléen.' })
  active?: boolean;

  // Chaîne base64 nue OU data URL (data:image/png;base64,...) — décodée et
  // validée (type réel par octets magiques, taille) dans filiales-image.ts.
  @IsOptional()
  @IsString({ message: 'logoBase64 doit être une chaîne.' })
  @IsNotEmpty({ message: 'logoBase64 ne peut pas être vide.' })
  logoBase64?: string;

  @IsOptional()
  @IsString({ message: 'stampBase64 doit être une chaîne.' })
  @IsNotEmpty({ message: 'stampBase64 ne peut pas être vide.' })
  stampBase64?: string;
}

export class ImportFilialesDto {
  @IsArray({ message: 'items doit être un tableau.' })
  @ArrayMaxSize(IMPORT_FILIALES_MAX_ITEMS, { message: `Un import ne peut pas contenir plus de ${IMPORT_FILIALES_MAX_ITEMS} filiales.` })
  items!: unknown[];
}

export interface ImportFilialesError {
  index: number;
  message: string;
}

export interface ImportFilialesResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportFilialesError[];
}
