import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toListResponse, toPrismaPage } from '../common/pagination';
import type { AuditListResponse } from '../contracts/audit';
import type { JsonValue } from '../contracts/common';
import { AUDIT_ACTIONS, isAuditAction } from './audit-actions';
import type { AuditAction, AuditActionDomain } from './audit-actions';
import { AUDIT_EXPORT_MAX_ROWS, buildAuditExportCsv } from './audit-csv';
import { resolveAuditPeriod } from './audit-period';
import { AuditService } from './audit.service';

/** Filtres communs à la liste et à l'export. */
export interface AuditFilters {
  readonly bonId?: string;
  /** Qui a agi : fragment du nom affiché ou de l'email. */
  readonly user?: string;
  /** Ancien nom du filtre `user` (email seul). */
  readonly userEmail?: string;
  /** Action du catalogue, ou fragment (ancienne forme). */
  readonly action?: string;
  readonly domain?: AuditActionDomain;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/** Nombre maximal de comptes dont on reprend l'email quand le filtre
 *  « auteur » correspond à un nom (entrées tracées par email seul). */
const USER_NAME_MATCH_LIMIT = 200;

const LOG_INCLUDE = {
  bon: { select: { id: true, reference: true } },
  user: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.AuditLogInclude;

type AuditLogWithRelations = Prisma.AuditLogGetPayload<{ include: typeof LOG_INCLUDE }>;

const FILTER_NAMES = ['user', 'userEmail', 'action', 'domain', 'dateFrom', 'dateTo', 'bonId'] as const;

function actionsOfDomain(domain: AuditActionDomain): AuditAction[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((action) => AUDIT_ACTIONS[action].domain === domain);
}

/** Action exacte quand c'est une clé du catalogue ; sinon fragment (ancien filtre libre). */
function actionCondition(action: string): Prisma.StringFilter<'AuditLog'> | string {
  return isAuditAction(action) ? action : { contains: action, mode: 'insensitive' };
}

/**
 * Lecture du journal d'audit pour l'écran « Journal d'audit » et son export
 * CSV. L'écriture, elle, passe par `AuditService.record`.
 */
@Injectable()
export class AuditJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** GET /audit — entrées filtrées, les plus récentes d'abord. `meta` annonce
   *  AVANT l'export que celui-ci serait tronqué. */
  async list(filters: AuditFilters, page: { page: number; limit: number }): Promise<AuditListResponse> {
    const where = await this.buildWhere(filters);
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrismaPage(page), include: LOG_INCLUDE }),
      this.prisma.auditLog.count({ where }),
    ]);
    const items = (await this.resolveNamesByEmail(logs)).map((log) => ({
      ...log,
      // Même valeur JSON ; seul le type de Prisma (objets aux valeurs facultatives) diffère du contrat.
      details: log.details as JsonValue | null,
      createdAt: log.createdAt.toISOString(),
    }));
    return toListResponse(items, {
      total,
      page: page.page,
      limit: page.limit,
      meta: { exportLimit: AUDIT_EXPORT_MAX_ROWS, exportTruncated: total > AUDIT_EXPORT_MAX_ROWS },
    });
  }

  /**
   * GET /audit/export — CSV lisible des entrées correspondant aux mêmes
   * filtres, plafonné à AUDIT_EXPORT_MAX_ROWS (dépassement dans `truncated`).
   * L'export est lui-même tracé (`audit_exported`), avec le nom des filtres
   * utilisés mais pas leur texte.
   */
  async exportCsv(filters: AuditFilters, actor: { id: string; ip?: string | null }): Promise<{ csv: string; truncated: boolean }> {
    const rows = await this.prisma.auditLog.findMany({
      where: await this.buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      take: AUDIT_EXPORT_MAX_ROWS + 1,
      include: LOG_INCLUDE,
    });
    const truncated = rows.length > AUDIT_EXPORT_MAX_ROWS;
    const kept = truncated ? rows.slice(0, AUDIT_EXPORT_MAX_ROWS) : rows;
    const csv = buildAuditExportCsv(await this.resolveNamesByEmail(kept));
    await this.audit.recordSafely('audit_exported', {
      actorId: actor.id,
      ip: actor.ip,
      details: { rowCount: kept.length, truncated, filters: FILTER_NAMES.filter((name) => !!filters[name]) },
    });
    return { csv, truncated };
  }

  /** Actions présentes en base, par ordre alphabétique (filtres de l'écran). */
  async distinctActions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });
    return rows.map((row) => row.action);
  }

  private async buildWhere(filters: AuditFilters): Promise<Prisma.AuditLogWhereInput> {
    const createdAt = resolveAuditPeriod(filters.dateFrom, filters.dateTo);
    const userTerm = (filters.user ?? filters.userEmail ?? '').trim();
    const actionFilters: Prisma.AuditLogWhereInput[] = [
      ...(filters.action ? [{ action: actionCondition(filters.action) }] : []),
      ...(filters.domain ? [{ action: { in: actionsOfDomain(filters.domain) } }] : []),
    ];
    return {
      ...(filters.bonId ? { bonId: filters.bonId } : {}),
      ...(actionFilters.length === 1 ? actionFilters[0] : {}),
      ...(actionFilters.length > 1 ? { AND: actionFilters } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(userTerm ? { OR: await this.userConditions(userTerm) } : {}),
    };
  }

  /**
   * « Qui a agi » : l'auteur est tantôt une relation `user`, tantôt un simple
   * `userEmail` (connexion, signature, cachet…). On cherche donc le terme dans
   * les deux, par email ET par nom affiché — pour le nom, les entrées tracées
   * par email seul sont retrouvées par l'email des comptes de ce nom.
   */
  private async userConditions(term: string): Promise<Prisma.AuditLogWhereInput[]> {
    const contains = { contains: term, mode: 'insensitive' as const };
    const namedUsers = await this.prisma.user.findMany({
      where: { displayName: contains, email: { not: null } },
      select: { email: true },
      take: USER_NAME_MATCH_LIMIT,
    });
    const emails = namedUsers.flatMap((u) => (u.email ? [u.email] : []));
    return [
      { userEmail: contains },
      { user: { email: contains } },
      { user: { displayName: contains } },
      ...(emails.length > 0 ? [{ userEmail: { in: emails, mode: 'insensitive' as const } }] : []),
    ];
  }

  /**
   * Beaucoup d'entrées (connexion, signature, cachet) ne sont tracées qu'avec
   * `userEmail`, sans relation `user` : on retrouve le nom affiché par l'email
   * pour que la colonne « Qui » présente partout la même forme. `resolved`
   * signale au front un nom déduit de l'email, pas une relation.
   */
  private async resolveNamesByEmail(logs: AuditLogWithRelations[]) {
    const emails = [...new Set(logs.filter((l) => !l.user && l.userEmail).map((l) => (l.userEmail as string).toLowerCase()))];
    if (emails.length === 0) return logs;
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails, mode: 'insensitive' } },
      select: { email: true, displayName: true },
    });
    const nameByEmail = new Map(users.flatMap((u) => (u.email ? [[u.email.toLowerCase(), u.displayName] as const] : [])));
    return logs.map((l) => {
      const displayName = !l.user && l.userEmail ? nameByEmail.get(l.userEmail.toLowerCase()) : undefined;
      return displayName && l.userEmail
        ? { ...l, user: { id: null, displayName, email: l.userEmail, resolved: true as const } }
        : l;
    });
  }
}
