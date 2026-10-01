import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { KpiQueryDto } from './kpi-query.dto';
import { KPI_LIST_KEYS, KpiListKey } from '../lists/kpi-list-sources';
import { DEFAULT_PAGE_SIZE, LARGE_PAGE_SIZES } from '../../common/pagination';

/** Query de `GET /kpi/liste` : le chiffre (`indicateur`), sa période et sa
 *  filiale (mêmes règles que les onglets), et la page de la liste. Même
 *  pagination que `LargePaginationQueryDto` (25 par défaut, 50, 100 ou 200 :
 *  une carte de la période peut compter plusieurs centaines de lignes), recopiée
 *  ici parce que le DTO hérite déjà des paramètres de période. */
export class KpiListQueryDto extends KpiQueryDto {
  @IsIn(KPI_LIST_KEYS, { message: `indicateur doit valoir l'un de : ${KPI_LIST_KEYS.join(', ')}` })
  indicateur!: KpiListKey;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page doit être un entier' })
  @Min(1, { message: 'page doit être supérieur ou égal à 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsIn(LARGE_PAGE_SIZES, { message: `limit doit valoir ${LARGE_PAGE_SIZES.join(', ')}` })
  limit: number = DEFAULT_PAGE_SIZE;
}
