import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ContestationOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { createContestation } from './contestation-create';
import { resolveContestation } from './contestation-resolve';
import { ContestationListFilters, findContestations, findMyContestations } from './contestation-queries';
import { CONTESTATION_BON_WITH_STATUS, CONTESTATION_PEOPLE_INCLUDE } from './contestation-selects';
import type { ContestableDocument } from './contested-document';
import { BON_CORRECTOR, BonCorrector } from './bon-correction.port';

/**
 * Contestations : le collaborateur conteste un document de son bon, l'équipe
 * informatique la prend en charge puis la tranche (Fondée / Non retenue).
 * Chaque étape vit dans son fichier ; ce service les relie à leurs dépendances.
 */
@Injectable()
export class ContestationService {
  private readonly logger = new Logger(ContestationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @Inject(BON_CORRECTOR) private readonly corrector: BonCorrector,
  ) {}

  create(bonId: string, userId: string, message: string, document?: ContestableDocument) {
    return createContestation(
      { prisma: this.prisma, notificationService: this.notificationService, logger: this.logger },
      { bonId, userId, message, document },
    );
  }

  findAll(filters: ContestationListFilters) {
    return findContestations(this.prisma, filters);
  }

  findMine(userId: string) {
    return findMyContestations(this.prisma, userId);
  }

  /** Prise en charge : « pris en charge par » la personne connectée. Seule une
   *  contestation nouvelle peut l'être (deux techniciens en même temps : le
   *  premier l'emporte, le second reçoit 409). */
  async markInReview(id: string, reviewerId: string) {
    const claimed = await this.prisma.contestation.updateMany({
      where: { id, status: 'open' },
      data: { status: 'in_review', reviewedById: reviewerId, reviewedAt: new Date() },
    });
    if (claimed.count === 0) {
      const exists = await this.prisma.contestation.count({ where: { id } });
      if (!exists) throw new NotFoundException('Contestation introuvable');
      throw new ConflictException('Cette contestation est déjà prise en charge ou tranchée.');
    }
    return this.prisma.contestation.findUniqueOrThrow({
      where: { id },
      include: { ...CONTESTATION_PEOPLE_INCLUDE, bon: CONTESTATION_BON_WITH_STATUS },
    });
  }

  resolve(id: string, actorId: string, outcome: ContestationOutcome, resolutionMessage?: string) {
    return resolveContestation(
      {
        prisma: this.prisma,
        notificationService: this.notificationService,
        corrector: this.corrector,
        logger: this.logger,
      },
      { contestationId: id, actorId, outcome, resolutionMessage },
    );
  }
}
