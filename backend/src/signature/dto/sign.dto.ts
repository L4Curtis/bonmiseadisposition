import { IsString, IsBoolean, IsOptional, IsIn, MaxLength, Matches } from 'class-validator';

export class SignDto {
  @IsString()
  @Matches(/^data:image\//, { message: 'La signature doit être une image valide (data:image/...)' })
  @MaxLength(500000, { message: 'La signature est trop volumineuse (max ~375 Ko)' })
  signatureDataUrl: string; // Base64 PNG data URL from canvas

  @IsBoolean()
  mentionLuApprouve: boolean;
}

export class SignItDto {
  @IsString()
  @Matches(/^data:image\//, { message: 'La signature doit être une image valide (data:image/...)' })
  @MaxLength(500000, { message: 'La signature est trop volumineuse (max ~375 Ko)' })
  signatureDataUrl: string;

  @IsOptional()
  @IsIn(['mise_disposition', 'restitution'])
  pdfType?: 'mise_disposition' | 'restitution';
}
