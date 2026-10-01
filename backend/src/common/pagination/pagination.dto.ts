import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { PageSize } from '../../contracts/common';

/** Tailles de page communes à toutes les listes paginées. */
export const PAGE_SIZES: readonly PageSize[] = [25, 50, 100];

export const DEFAULT_PAGE_SIZE: PageSize = 25;

/** Tailles admises par les listes de travail volumineuses (inventaire). */
export const LARGE_PAGE_SIZES: readonly number[] = [...PAGE_SIZES, 200];

const PAGE_SIZE_MESSAGE = `limit doit valoir ${PAGE_SIZES.join(', ')}`;

/**
 * Paramètres de pagination d'une liste (`?page=2&limit=50`), lus par le
 * ValidationPipe global :
 *  - `page` : entier ≥ 1, 1 par défaut ;
 *  - `limit` : 25, 50 ou 100, 25 par défaut.
 * Une valeur hors bornes est refusée en 400 `validation_failed`, jamais
 * corrigée en silence. Le DTO d'une liste en hérite et ajoute ses filtres :
 *
 *   class BonsListQueryDto extends PaginationQueryDto {
 *     @IsOptional() @IsString() search?: string;
 *   }
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page doit être un entier' })
  @Min(1, { message: 'page doit être supérieur ou égal à 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZES, { message: PAGE_SIZE_MESSAGE })
  limit: number = DEFAULT_PAGE_SIZE;
}

/** Pagination d'une liste de travail volumineuse : 200 admis en plus. */
export class LargePaginationQueryDto {
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

export interface PageRequest {
  readonly page: number;
  readonly limit: number;
}

/** `skip` et `take` de Prisma pour la page demandée. */
export function toPrismaPage({ page, limit }: PageRequest): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
