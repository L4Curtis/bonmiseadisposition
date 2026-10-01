import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { AUDIT_ACTION_DOMAINS } from '../audit-actions';
import type { AuditActionDomain } from '../audit-actions';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DOMAINS = Object.keys(AUDIT_ACTION_DOMAINS) as AuditActionDomain[];

/**
 * GET /audit et GET /audit/export : filtres du journal, communs à la liste et
 * à l'export, et pagination de la liste (25, 50 ou 100 par page ; l'export
 * l'ignore). Les dates sont des jours civils à l'heure de Paris (AAAA-MM-JJ),
 * bornes incluses.
 */
export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'bonId doit être un identifiant de bon' })
  bonId?: string;

  /** Qui a agi : fragment du nom affiché ou de l'email. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;

  /** Ancien nom du filtre `user` (email seul), accepté le temps de la vague. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  userEmail?: string;

  /** Action du catalogue (`bon_cancelled`) ; un fragment est encore accepté. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  /** Famille d'actions (`config`, `bon`…). */
  @IsOptional()
  @IsIn(DOMAINS, { message: `domain doit valoir ${DOMAINS.join(', ')}` })
  domain?: AuditActionDomain;

  @IsOptional()
  @Matches(ISO_DAY, { message: 'dateFrom doit être une date AAAA-MM-JJ' })
  dateFrom?: string;

  @IsOptional()
  @Matches(ISO_DAY, { message: 'dateTo doit être une date AAAA-MM-JJ' })
  dateTo?: string;
}
