import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditFilters {
  bonId?: string;
  userEmail?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: AuditFilters) {
    const { bonId, userEmail, action, dateFrom, dateTo, page = 1 } = filters;
    const limit = Math.min(filters.limit ?? 50, 100);

    const where: Prisma.AuditLogWhereInput = {};

    if (bonId) where.bonId = bonId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (userEmail) {
      where.OR = [
        { userEmail: { contains: userEmail, mode: 'insensitive' } },
        { user: { email: { contains: userEmail, mode: 'insensitive' } } },
      ];
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          bon: { select: { id: true, reference: true } },
          user: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Uniformisation : beaucoup d'entrées (login, signature, cachet) ne sont
    // tracées qu'avec userEmail (pas de userId → relation user nulle). On résout
    // le nom d'affichage par email pour que la colonne « Utilisateur » présente
    // partout le même format (nom + email), pas tantôt l'un tantôt l'autre.
    const emailsToResolve = [
      ...new Set(
        logs
          .filter((l) => !l.user && l.userEmail)
          .map((l) => (l.userEmail as string).toLowerCase()),
      ),
    ];
    if (emailsToResolve.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { email: { in: emailsToResolve } },
        select: { email: true, displayName: true },
      });
      const nameByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.displayName]));
      const enriched = logs.map((l) => {
        if (!l.user && l.userEmail) {
          const displayName = nameByEmail.get(l.userEmail.toLowerCase());
          if (displayName) {
            // resolved:true signale au front un nom déduit de l'email (pas une relation)
            return { ...l, user: { id: null, displayName, email: l.userEmail, resolved: true } };
          }
        }
        return l;
      });
      return { logs: enriched, total, page, limit };
    }

    return { logs, total, page, limit };
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
}
