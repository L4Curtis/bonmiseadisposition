import { IsString, IsBoolean, IsOptional, IsIn, MaxLength } from 'class-validator';

export class SignDto {
  @IsString()
  @MaxLength(500000, { message: 'La signature est trop volumineuse (max ~375 Ko)' })
  signatureDataUrl: string; // Base64 PNG data URL from canvas

  @IsBoolean()
  mentionLuApprouve: boolean;
}

export class InitiateInPersonDto {
  @IsIn(['mise_disposition', 'restitution'])
  type: 'mise_disposition' | 'restitution';

  @IsOptional()
  @IsString()
  collaborateurEmail?: string;
}

export class SignItDto {
  @IsString()
  @MaxLength(500000, { message: 'La signature est trop volumineuse (max ~375 Ko)' })
  signatureDataUrl: string;

  @IsOptional()
  @IsIn(['mise_disposition', 'restitution'])
  pdfType?: 'mise_disposition' | 'restitution';
}
