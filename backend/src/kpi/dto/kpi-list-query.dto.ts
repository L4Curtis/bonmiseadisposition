import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { KpiQueryDto } from './kpi-query.dto';
import { KPI_LIST_KEYS, KpiListKey } from '../lists/kpi-list-sources';

export const KPI_LIST_DEFAULT_LIMIT = 50;
export const KPI_LIST_MAX_LIMIT = 200;

/** Query de `GET /kpi/liste` : le chiffre (`indicateur`), sa période et sa
 *  filiale (mêmes règles que les onglets), et la page de la liste. */
export class KpiListQueryDto extends KpiQueryDto {
  @IsIn(KPI_LIST_KEYS, { message: `indicateur doit valoir l'un de : ${KPI_LIST_KEYS.join(', ')}` })
  indicateur!: KpiListKey;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(KPI_LIST_MAX_LIMIT)
  limit?: number;
}
