import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { buildAwaitingSignatureWhere } from '../common/bon-predicates';
import { CLOSED_BON_STATUSES } from '../bons/bon-status';
import { KpiTodayResponse, TodayFilialeCount } from './today/today-types';
import {
  contestationsSection,
  departuresSection,
  draftsSection,
  expiredLinksSection,
  overdueReturnsSection,
  overdueSignaturesSection,
  partialRestitutionsSection,
} from './today/today-queries';

/**
 * `GET /kpi/aujourdhui` — accueil IT : tuiles et sections « À traiter ».
 *
 * Tout est un état du jour, jamais filtré par une période. Chaque chiffre est
 * calculé par le prédicat partagé (common/bon-predicates.ts) de la liste
 * qu'il ouvre : « Signatures attendues » → `/bons?awaitingSignature=1`,
 * « Signature en retard » → `/bons?overdue=1`, « Retour en retard » →
 * `/inventaire?overdue=1`, « Contestations à traiter » →
 * `/admin/contestations?aTraiter=1`, « Lien expiré » → `/bons?linkExpired=1`,
 * « Départs avec matériel » → `/inventaire?vue=collaborateurs&compte=inactif`,
 * « Restitution partielle à signer » → `/bons?subStatus=partial_restitution_to_sign`
 * (règle du filtre de sous-état, bons/queries/bon-substatus-filter.ts).
 * Pas de cache : la tuile et la liste doivent concorder à l'instant du clic.
 */
@Injectable()
export class KpiTodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async getToday(now: Date = new Date()): Promise<KpiTodayResponse> {
    const thresholdDays = await this.config.getSignatureOverdueDays();
    const openWhere = { status: { notIn: [...CLOSED_BON_STATUSES] } };

    const [
      openBons, activeBons, restitutionInProgress, awaitingSignatures, byFiliale,
      drafts, overdueSignatures, expiredLinks, overdueReturns, contestations, departures, partialRestitutions,
    ] = await Promise.all([
      this.prisma.bon.count({ where: openWhere }),
      this.prisma.bon.count({ where: { status: 'active' } }),
      this.prisma.bon.count({ where: { status: 'partially_returned' } }),
      this.prisma.bon.count({ where: buildAwaitingSignatureWhere() }),
      this.openBonsByFiliale(),
      draftsSection(this.prisma),
      overdueSignaturesSection(this.prisma, thresholdDays, now),
      expiredLinksSection(this.prisma, now),
      overdueReturnsSection(this.prisma, now),
      contestationsSection(this.prisma),
      departuresSection(this.prisma),
      partialRestitutionsSection(this.prisma, now),
    ]);

    return {
      asOf: now.toISOString(),
      signatureOverdueDays: thresholdDays,
      openBons,
      activeBons,
      restitutionInProgress,
      awaitingSignatures,
      overdueSignatures: overdueSignatures.total,
      overdueReturns: { equipments: overdueReturns.total, bons: overdueReturns.bons },
      contestationsToProcess: contestations.total,
      expiredLinks: expiredLinks.total,
      departures: { collaborateurs: departures.total, equipments: departures.equipments },
      openBonsByFiliale: byFiliale,
      toDo: {
        drafts,
        overdueSignatures,
        expiredLinks,
        overdueReturns: { total: overdueReturns.total, rows: overdueReturns.rows },
        contestations,
        departures: { total: departures.total, rows: departures.rows },
        partialRestitutionsToSign: partialRestitutions,
      },
    };
  }

  /** Bons ouverts par filiale active, les filiales à zéro omises. */
  private async openBonsByFiliale(): Promise<TodayFilialeCount[]> {
    const filiales = await this.prisma.filiale.findMany({
      where: { active: true },
      select: {
        id: true,
        displayName: true,
        _count: { select: { bons: { where: { status: { notIn: [...CLOSED_BON_STATUSES] } } } } },
      },
      orderBy: { displayName: 'asc' },
    });
    return filiales
      .map((f) => ({ id: f.id, name: f.displayName, count: f._count.bons }))
      .filter((f) => f.count > 0);
  }
}
