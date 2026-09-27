import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const CONTESTABLE_DOCUMENTS = ['mise_disposition', 'restitution', 'pv_cloture'] as const;
const OUTCOMES = ['founded', 'not_retained'] as const;

/** POST /bons/:id/contestation — le titulaire conteste un document du bon. */
export class CreateContestationDto {
  @IsString()
  @MinLength(1, { message: 'Le motif de la contestation est obligatoire' })
  @MaxLength(2000, { message: 'Le motif ne peut pas dépasser 2000 caractères' })
  message!: string;

  /** Document que l'écran propose de contester ; le serveur vérifie que
   *  c'est bien celui qui est contestable à cet instant. */
  @IsOptional()
  @IsIn(CONTESTABLE_DOCUMENTS, { message: 'document doit valoir mise_disposition, restitution ou pv_cloture' })
  document?: (typeof CONTESTABLE_DOCUMENTS)[number];
}

/** PATCH /contestations/:id/resolve — décision : Fondée ou Non retenue. */
export class ResolveContestationDto {
  @IsIn(OUTCOMES, { message: "outcome doit valoir 'founded' (Fondée) ou 'not_retained' (Non retenue)" })
  outcome!: (typeof OUTCOMES)[number];

  /** Réponse au collaborateur : obligatoire pour « Non retenue » (contrôlé
   *  par le service, espaces seuls compris). */
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La réponse ne peut pas dépasser 2000 caractères' })
  resolutionMessage?: string;
}
