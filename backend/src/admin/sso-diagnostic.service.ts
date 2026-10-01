import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SSO_ROLE_SYNC_ACTION } from '../auth/sso-diagnostic';
import type { SsoDiagnosticEntry, SsoGroupsClaimState } from '../contracts/admin';
import type { UserRole } from '../contracts/common';

const CLAIM_STATES: readonly SsoGroupsClaimState[] = ['presente', 'depassement', 'absente'];
const ROLES: readonly UserRole[] = ['admin', 'technician', 'direction', 'collaborator'];

function claimState(value: unknown): SsoDiagnosticEntry['state'] {
  return CLAIM_STATES.find((state) => state === value) ?? 'inconnu';
}

function role(value: unknown): UserRole | null {
  return ROLES.find((r) => r === value) ?? null;
}

const DEFAULT_LIMIT = 10;

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
    const logs = await this.prisma.auditLog.findMany({
      where: { action: SSO_ROLE_SYNC_ACTION },
      orderBy: { createdAt: 'desc' },
      take: limit,
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
        at: log.createdAt.toISOString(),
        user: log.user?.displayName ?? log.userEmail ?? 'Inconnu',
        state: claimState(details['state']),
        groupsCount: typeof details['groupsCount'] === 'number' ? details['groupsCount'] : 0,
        resolvedRole: role(details['resolvedRole']),
        message: typeof details['message'] === 'string' ? details['message'] : '',
      };
    });
  }
}
