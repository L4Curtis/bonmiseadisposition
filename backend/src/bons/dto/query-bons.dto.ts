import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BonStatus } from '../../common/types';
import { BON_SORT_FIELDS, BonSortField, SORT_ORDERS, SortOrder } from '../queries/bon-order';
import { BonListFilters } from '../queries/bon-where';

/** Nombre maximal d'identifiants dans `ids` (export de la sélection) : une page
 *  de liste compte au plus 100 bons, et l'URL reste ainsi sous 4 ko. */
export const MAX_SELECTED_IDS = 100;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts "a,b,c" or repeated params and normalizes to an array. */
const toStatusArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

/** Accepts the usual query-string boolean spellings: '1', 'true' (any case), or a real boolean. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return value;
};

export class QueryBonsDto {
  @IsOptional()
  @Transform(toStatusArray)
  @IsEnum(BonStatus, { each: true, message: 'status contient une valeur de statut inconnue' })
  status?: BonStatus[];

  @IsOptional()
  @Transform(toStatusArray)
  @IsEnum(BonStatus, { each: true, message: 'excludeStatus contient une valeur de statut inconnue' })
  excludeStatus?: BonStatus[];

  @IsOptional()
  @IsUUID()
  filialeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  /** Début de période (date de mise à disposition, incluse), AAAA-MM-JJ. */
  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'dateFrom doit être une date au format AAAA-MM-JJ' })
  @IsISO8601({ strict: true }, { message: 'dateFrom n’est pas une date valide' })
  dateFrom?: string;

  /** Fin de période (date de mise à disposition, incluse), AAAA-MM-JJ. */
  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'dateTo doit être une date au format AAAA-MM-JJ' })
  @IsISO8601({ strict: true }, { message: 'dateTo n’est pas une date valide' })
  dateTo?: string;

  /** Uniquement les bons sans date de restitution prévue. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  noReturnDate?: boolean;

  /** Créateur du bon (le technicien ou l'administrateur qui l'a saisi). */
  @IsOptional()
  @IsUUID()
  createdById?: string;

  /** Sélection explicite, « a,b,c » ou paramètre répété. */
  @IsOptional()
  @Transform(toStatusArray)
  @ArrayMaxSize(MAX_SELECTED_IDS, { message: `ids ne peut pas contenir plus de ${MAX_SELECTED_IDS} identifiants` })
  @IsUUID('all', { each: true, message: 'ids contient un identifiant invalide' })
  ids?: string[];

  @IsOptional()
  @IsIn(BON_SORT_FIELDS, { message: `sort doit valoir l'un de : ${BON_SORT_FIELDS.join(', ')}` })
  sort?: BonSortField;

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'order doit valoir asc ou desc' })
  order?: SortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Filtres et tri communs à `GET /bons` et `GET /bons/export`, extraits du DTO
 *  déjà validé. Seule règle qui porte sur deux champs à la fois : une période
 *  dont le début suit la fin est refusée (400) plutôt que de renvoyer une
 *  liste vide sans explication. */
export function toBonListQuery(
  dto: QueryBonsDto,
): BonListFilters & { sort?: BonSortField; order?: SortOrder } {
  const {
    status, excludeStatus, filialeId, search, overdue,
    dateFrom, dateTo, noReturnDate, createdById, ids, sort, order,
  } = dto;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new BadRequestException('La date de début de période doit précéder la date de fin');
  }
  return {
    status, excludeStatus, filialeId, search, overdue,
    dateFrom, dateTo, noReturnDate, createdById, ids, sort, order,
  };
}
