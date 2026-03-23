import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateContestationDto {
  @IsString()
  @MinLength(1, { message: 'Le message est requis' })
  @MaxLength(2000, { message: 'Le message ne peut pas dépasser 2000 caractères' })
  message!: string;
}

export class InitiateRestitutionDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'returnedEquipmentIds doit contenir des UUIDs valides' })
  returnedEquipmentIds?: string[];
}

export class InitiateInPersonDto {
  @IsEnum(['mise_disposition', 'restitution'], {
    message: "type doit être 'mise_disposition' ou 'restitution'",
  })
  type!: 'mise_disposition' | 'restitution';
}

export class DeclareNotReturnedDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'equipmentIds doit contenir des UUIDs valides' })
  equipmentIds!: string[];

  @IsString()
  @MinLength(1, { message: 'La raison est requise' })
  @MaxLength(1000, { message: 'La raison ne peut pas dépasser 1000 caractères' })
  reason!: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:image\//, { message: 'La signature doit être une image valide (data:image/...)' })
  @MaxLength(2_000_000, { message: 'La signature est trop volumineuse' })
  signatureDataUrl?: string;
}

export class MarkFoundDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'equipmentIds doit contenir des UUIDs valides' })
  equipmentIds!: string[];

  @IsOptional()
  @IsString()
  @Matches(/^data:image\//, { message: 'La signature doit être une image valide (data:image/...)' })
  @MaxLength(2_000_000, { message: 'La signature est trop volumineuse' })
  signatureDataUrl?: string;
}
