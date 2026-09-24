import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_EXPORT_MAX_ROWS, buildAuditExportCsv } from './audit-csv';
import { resolveAuditPeriod } from './audit-period';

export interface AuditFilters {
  bonId?: string;
  /** Qui a fait l'action : fragment du nom affiché ou de l'email. */
  user?: string;
  /** Ancien nom du filtre `user` (email seul), conservé pour compatibilité. */
  userEmail?: string;
  action?: string;
  /** Jours civils à l'heure de Paris (AAAA-MM-JJ), bornes incluses. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

/** Nombre maximal de comptes dont on reprend l'email quand le filtre
 *  « utilisateur » correspond à un nom (entrées tracées par email seul). */
const USER_NAME_MATCH_LIMIT = 200;

const LOG_INCLUDE = {
  bon: { select: { id: true, reference: true } },
  user: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.AuditLogInclude;

type AuditLogWithRelations = Prisma.AuditLogGetPayload<{ include: typeof LOG_INCLUDE }>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: AuditFilters) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const where = await this.buildWhere(filters);

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: LOG_INCLUDE,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs: await this.resolveNamesByEmail(logs),
      total,
      page,
      limit,
      // L'interface prévient AVANT l'export que celui-ci sera tronqué.
      exportLimit: AUDIT_EXPORT_MAX_ROWS,
      exportTruncated: total > AUDIT_EXPORT_MAX_ROWS,
    };
  }

  /**
   * GET /audit/export — CSV des entrées correspondant aux mêmes filtres que
   * la liste, des plus récentes aux plus anciennes, plafonné à
   * AUDIT_EXPORT_MAX_ROWS (dépassement renvoyé dans `truncated`). L'export
   * est lui-même journalisé (`audit_exported`), sans le texte des filtres.
   */
  async exportCsv(filters: AuditFilters, actorId: string): Promise<{ csv: string; truncated: boolean }> {
    const where = await this.buildWhere(filters);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: AUDIT_EXPORT_MAX_ROWS + 1,
      include: LOG_INCLUDE,
    });
    const truncated = rows.length > AUDIT_EXPORT_MAX_ROWS;
    const kept = truncated ? rows.slice(0, AUDIT_EXPORT_MAX_ROWS) : rows;
    const csv = buildAuditExportCsv(await this.resolveNamesByEmail(kept));

    const usedFilters = (['user', 'userEmail', 'action', 'dateFrom', 'dateTo', 'bonId'] as const)
      .filter((key) => !!filters[key]);
    await this.prisma.auditLog
      .create({
        data: {
          userId: actorId,
          action: 'audit_exported',
          details: { rowCount: kept.length, truncated, filters: usedFilters },
        },
      })
      .catch((err: unknown) => {
        this.logger.error(`Audit audit_exported non journalisé : ${err instanceof Error ? err.message : String(err)}`);
      });

    return { csv, truncated };
  }

  /** Liste des actions distinctes présentes en DB (pour les filtres UI) */
  async getDistinctActions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });
    return rows.map((r) => r.action);
  }

  /** Filtres communs à la liste et à l'export. */
  private async buildWhere(filters: AuditFilters): Promise<Prisma.AuditLogWhereInput> {
    const createdAt = resolveAuditPeriod(filters.dateFrom, filters.dateTo);
    const userTerm = (filters.user ?? filters.userEmail ?? '').trim();
    return {
      ...(filters.bonId ? { bonId: filters.bonId } : {}),
      ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' as const } } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(userTerm ? { OR: await this.userConditions(userTerm) } : {}),
    };
  }

  /**
   * « Qui a fait l'action » : l'auteur est tantôt une relation `user`, tantôt
   * un simple `userEmail` (connexion, signature, cachet…). On cherche donc le
   * terme dans les deux, par email ET par nom affiché — pour le nom, les
   * entrées tracées par email seul sont retrouvées via l'email des comptes
   * dont le nom correspond.
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

  // Uniformisation : beaucoup d'entrées (login, signature, cachet) ne sont
  // tracées qu'avec userEmail (pas de userId → relation user nulle). On résout
  // le nom d'affichage par email pour que la colonne « Utilisateur » présente
  // partout le même format (nom + email), pas tantôt l'un tantôt l'autre.
  private async resolveNamesByEmail(logs: AuditLogWithRelations[]) {
    const emailsToResolve = [
      ...new Set(
        logs
          .filter((l) => !l.user && l.userEmail)
          .map((l) => (l.userEmail as string).toLowerCase()),
      ),
    ];
    if (emailsToResolve.length === 0) return logs;

    const users = await this.prisma.user.findMany({
      where: { email: { in: emailsToResolve, mode: 'insensitive' } },
      select: { email: true, displayName: true },
    });
    const nameByEmail = new Map(
      users
        .filter((u): u is typeof u & { email: string } => !!u.email)
        .map((u) => [u.email.toLowerCase(), u.displayName]),
    );
    return logs.map((l) => {
      if (!l.user && l.userEmail) {
        const displayName = nameByEmail.get(l.userEmail.toLowerCase());
        if (displayName) {
          // resolved:true signale au front un nom déduit de l'email (pas une relation)
          return { ...l, user: { id: null, displayName, email: l.userEmail, resolved: true } };
        }
      }
      return l;
    });
  }
}
