import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// Strict calendar date (the column is @db.Date): a full ISO datetime with a
// timezone offset would be converted to UTC and could shift the date by a day.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_MESSAGE = 'La date doit être au format YYYY-MM-DD';

export class BonEquipmentDto {
  @IsOptional() @IsString() catalogItemId?: string;
  @IsOptional() @IsString() customLabel?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() inventoryNumber?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class CreateBonDto {
  @IsString() filialeId!: string;
  @IsString() collaborateurId!: string;
  @IsEnum(['mme', 'mr']) civilite!: string;
  @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE }) dateMiseDisposition!: string;
  @IsOptional() @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE }) dateRestitution?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonEquipmentDto)
  equipments?: BonEquipmentDto[];
  @IsOptional() @IsString() packId?: string;
}

export class UpdateBonDto {
  @IsOptional() @IsString() filialeId?: string;
  @IsOptional() @IsString() collaborateurId?: string;
  @IsOptional() @IsEnum(['mme', 'mr']) civilite?: string;
  @IsOptional() @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE }) dateMiseDisposition?: string;
  @IsOptional() @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE }) dateRestitution?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonEquipmentDto)
  equipments?: BonEquipmentDto[];
}
