import { IsOptional, IsUUID, Matches } from 'class-validator';

/** Query commune aux trois endpoints KPI : période (AAAA-MM-JJ) et filiale optionnelles. */
export class KpiQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format de date attendu : AAAA-MM-JJ' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format de date attendu : AAAA-MM-JJ' })
  to?: string;

  @IsOptional()
  @IsUUID()
  filialeId?: string;
}
