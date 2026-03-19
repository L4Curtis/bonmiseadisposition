import { Injectable } from '@nestjs/common';
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
    const { bonId, userEmail, action, dateFrom, dateTo, page = 1, limit = 50 } = filters;

    const where: any = {};

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
