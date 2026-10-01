import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { BonStatus } from '../../common/types';
import { PaginationQueryDto } from '../../common/pagination';
import { BON_SORT_FIELDS, BonSortField, SORT_ORDERS, SortOrder } from '../queries/bon-order';
import { BonListFilters, DayRange } from '../queries/bon-where';
import { BON_SUB_STATUSES } from '../bon-status';
import type { BonSubStatus } from '../../contracts/bons';

/** Nombre maximal d'identifiants dans `ids` (export de la sélection) : une page
 *  de liste compte au plus 100 bons, et l'URL reste ainsi sous 4 ko. */
export const MAX_SELECTED_IDS = 100;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Référence d'un bon : BON-AAAA-NNNN (casse indifférente). */
const REFERENCE_PATTERN = /^BON-\d{4}-\d{4,}$/i;

/** Accepts "a,b,c" or repeated params and normalizes to an array. */
const toStatusArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

/** Accepts the usual query-string boolean spellings: '1', 'true' (any case), or a real boolean. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return value;
};

/** Jour civil facultatif, au format AAAA-MM-JJ et réel (pas de 30 février). */
function IsDay(field: string): PropertyDecorator {
  return (target, key) => {
    IsOptional()(target, key);
    Matches(DAY_PATTERN, { message: `${field} doit être une date au format AAAA-MM-JJ` })(target, key);
    IsISO8601({ strict: true }, { message: `${field} n’est pas une date valide` })(target, key);
  };
}

/**
 * Paramètres de `GET /bons` (liste, pagination commune : `limit` 25, 50 ou
 * 100) et de `GET /bons/export` (mêmes filtres et même tri ; la pagination y
 * est ignorée).
 */
export class QueryBonsDto extends PaginationQueryDto {
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

  /** Recherche libre (sous-chaîne) : référence, nom ou email du collaborateur,
   *  numéro de série ou d'inventaire. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Référence exacte d'un bon (BON-AAAA-NNNN) : ce bon seul, jamais ses
   *  voisins (BON-2026-001 ne ramène pas BON-2026-0010 à 0019). */
  @IsOptional()
  @Matches(REFERENCE_PATTERN, { message: 'reference doit être une référence de bon (BON-AAAA-NNNN)' })
  reference?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  /** Sous-état de « Restitution en cours » (même règle que la fiche). */
  @IsOptional()
  @IsIn(BON_SUB_STATUSES, { message: `subStatus doit valoir l'un de : ${BON_SUB_STATUSES.join(', ')}` })
  subStatus?: BonSubStatus;

  /** « Signature attendue » : même prédicat que la tuile de l'accueil. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  awaitingSignature?: boolean;

  /** « Lien expiré » : signature attendue, dernier lien expiré sans relève. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  linkExpired?: boolean;

  /** Début de période (date de mise à disposition, incluse), AAAA-MM-JJ. */
  @IsDay('dateFrom')
  dateFrom?: string;

  /** Fin de période (date de mise à disposition, incluse), AAAA-MM-JJ. */
  @IsDay('dateTo')
  dateTo?: string;

  /** Créés sur la période (jours de Paris, bornes incluses) : liste « Bons
   *  créés » du tableau de bord. */
  @IsDay('createdFrom')
  createdFrom?: string;

  @IsDay('createdTo')
  createdTo?: string;

  /** Clôturés sur la période (date de clôture) : liste « Bons clôturés ». */
  @IsDay('closedFrom')
  closedFrom?: string;

  @IsDay('closedTo')
  closedTo?: string;

  /** Annulés sur la période (journal d'audit) : liste « Bons annulés ». */
  @IsDay('cancelledFrom')
  cancelledFrom?: string;

  @IsDay('cancelledTo')
  cancelledTo?: string;

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
}

/** Période facultative. Un début qui suit la fin est refusé (400) plutôt que
 *  de renvoyer une liste vide sans explication. */
function dayRange(from: string | undefined, to: string | undefined, label: string): DayRange | undefined {
  if (!from && !to) return undefined;
  if (from && to && from > to) {
    throw new BadRequestException(`La date de début de la période ${label} doit précéder la date de fin`);
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** Filtres et tri communs à `GET /bons` et `GET /bons/export`, extraits du DTO
 *  déjà validé (la pagination n'en fait pas partie). */
export function toBonListQuery(
  dto: QueryBonsDto,
): BonListFilters & { sort?: BonSortField; order?: SortOrder } {
  const {
    status, excludeStatus, filialeId, search, reference, overdue, awaitingSignature, linkExpired, subStatus,
    noReturnDate, createdById, ids, sort, order,
  } = dto;
  const mise = dayRange(dto.dateFrom, dto.dateTo, 'de mise à disposition');
  return {
    status, excludeStatus, filialeId, search, overdue, awaitingSignature, linkExpired, subStatus,
    dateFrom: mise?.from, dateTo: mise?.to, noReturnDate, createdById, ids, sort, order,
    ...(reference ? { reference: reference.toUpperCase() } : {}),
    created: dayRange(dto.createdFrom, dto.createdTo, 'de création'),
    closed: dayRange(dto.closedFrom, dto.closedTo, 'de clôture'),
    cancelled: dayRange(dto.cancelledFrom, dto.cancelledTo, 'd’annulation'),
  };
}
