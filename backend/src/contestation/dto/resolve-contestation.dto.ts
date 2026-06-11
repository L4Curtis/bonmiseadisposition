import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveContestationDto {
  @IsIn(['resolved', 'rejected'], {
    message: "action doit être 'resolved' ou 'rejected'",
  })
  action!: 'resolved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Le message de résolution ne peut pas dépasser 2000 caractères' })
  resolutionMessage?: string;

  /** Corriger et re-signer : annule le bon contesté et crée un brouillon
   *  pré-rempli lié (uniquement avec action 'resolved'). */
  @IsOptional()
  @IsBoolean()
  correct?: boolean;
}
