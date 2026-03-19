import { IsString, IsBoolean, IsOptional, IsIn } from 'class-validator';

export class SignDto {
  @IsString()
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
