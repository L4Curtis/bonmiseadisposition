import {
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsDateString() dateMiseDisposition!: string;
  @IsOptional() @IsDateString() dateRestitution?: string;
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
  @IsOptional() @IsDateString() dateMiseDisposition?: string;
  @IsOptional() @IsDateString() dateRestitution?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonEquipmentDto)
  equipments?: BonEquipmentDto[];
}
