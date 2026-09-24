import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  @Matches(/^data:image\/png;base64,/, { message: 'La signature doit être une image PNG valide (data:image/png;base64,...)' })
  @MaxLength(2_000_000, { message: 'La signature est trop volumineuse' })
  signatureDataUrl?: string;
}

export class CloseUnilateralDto {
  @IsString()
  @MinLength(10, { message: 'Le motif doit faire au moins 10 caractères' })
  @MaxLength(1000, { message: 'Le motif ne peut pas dépasser 1000 caractères' })
  reason!: string;
}

export class MarkFoundDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'equipmentIds doit contenir des UUIDs valides' })
  equipmentIds!: string[];

  @IsOptional()
  @IsString()
  @Matches(/^data:image\/png;base64,/, { message: 'La signature doit être une image PNG valide (data:image/png;base64,...)' })
  @MaxLength(2_000_000, { message: 'La signature est trop volumineuse' })
  signatureDataUrl?: string;
}

/** Nombre maximal de bons relancés par appel groupé : chaque relance génère un
 *  jeton, un email et une ligne d'audit, et la requête doit rester courte — le
 *  frontend découpe une sélection plus grande en lots successifs. */
export const MAX_RESEND_BATCH = 10;

export class ResendBatchDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Aucun bon à relancer' })
  @ArrayMaxSize(MAX_RESEND_BATCH, { message: `Au plus ${MAX_RESEND_BATCH} bons par relance groupée` })
  @IsUUID('all', { each: true, message: 'ids doit contenir des identifiants de bons valides' })
  ids!: string[];

  /** Relancer aussi les bons dont un lien a été envoyé il y a moins d'une heure
   *  (même confirmation que le bouton « Renvoyer le lien » de la fiche). */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
