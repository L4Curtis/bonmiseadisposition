import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SSO_ROLE_SYNC_ACTION } from '../auth/sso-diagnostic';

export interface SsoDiagnosticEntry {
  at: Date;
  user: string;
  state: string;
  groupsCount: number;
  resolvedRole: string | null;
  message: string;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Dernières connexions SSO et ce qu'elles ont donné en matière de rôle.
 *
 * Sans cette vue, une revendication de groupes absente sur l'inscription
 * d'application Entra se traduit par « la personne est dans le groupe mais
 * n'obtient pas son rôle », sans aucune trace consultable depuis l'application.
 */
@Injectable()
export class SsoDiagnosticService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecent(limit = DEFAULT_LIMIT): Promise<SsoDiagnosticEntry[]> {
    const borne = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const logs = await this.prisma.auditLog.findMany({
      where: { action: SSO_ROLE_SYNC_ACTION },
      orderBy: { createdAt: 'desc' },
      take: borne,
      select: {
        createdAt: true,
        userEmail: true,
        details: true,
        user: { select: { displayName: true } },
      },
    });

    return logs.map((log) => {
      const details = (log.details ?? {}) as Record<string, unknown>;
      return {
        at: log.createdAt,
        user: log.user?.displayName ?? log.userEmail ?? 'Inconnu',
        state: typeof details['state'] === 'string' ? details['state'] : 'inconnu',
        groupsCount: typeof details['groupsCount'] === 'number' ? details['groupsCount'] : 0,
        resolvedRole: typeof details['resolvedRole'] === 'string' ? details['resolvedRole'] : null,
        message: typeof details['message'] === 'string' ? details['message'] : '',
      };
    });
  }
}
