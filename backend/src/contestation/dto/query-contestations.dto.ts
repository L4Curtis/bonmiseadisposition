import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ContestationStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/pagination';

/** « a,b » ou paramètre répété → liste ; valeurs vides ignorées. */
const toList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value;

/** « 1 » ou « true » (toute casse) → vrai. */
const toBoolean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value === '1' || value.toLowerCase() === 'true' : value;

/**
 * Paramètres de `GET /contestations` (IT) : pagination commune (25, 50 ou
 * 100 lignes), statut(s) et « à traiter ». Un statut inconnu est refusé (400)
 * plutôt qu'ignoré.
 */
export class QueryContestationsDto extends PaginationQueryDto {
  /** Une valeur ou plusieurs séparées par des virgules (`open,in_review`). */
  @IsOptional()
  @Transform(toList)
  @IsEnum(ContestationStatus, { each: true, message: 'status contient un statut de contestation inconnu' })
  status?: ContestationStatus[];

  /** `aTraiter=1` : les contestations à traiter, avec le prédicat de la tuile
   *  de l'accueil ; prime sur `status`. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'aTraiter doit valoir 1 ou true' })
  aTraiter?: boolean;
}
