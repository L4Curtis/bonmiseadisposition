import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BonStatus } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { SignatureService } from '../signature/signature.service';
import { BonsService } from '../bons/bons.service';

@Injectable()
export class ContestationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly signatureService: SignatureService,
    @Inject(forwardRef(() => BonsService))
    private readonly bonsService: BonsService,
  ) {}

  // ─── Créer une contestation (collaborateur) ──────────────────────────────────

  async create(bonId: string, userId: string, message: string) {
    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      include: {
        filiale: true,
        collaborateur: { select: { id: true, displayName: true, email: true } },
      },
    });

    if (!bon) throw new NotFoundException('Bon introuvable');
    if (bon.collaborateurId !== userId)
      throw new ForbiddenException('Vous ne pouvez contester que vos propres bons');
    if (bon.status !== 'active')
      throw new BadRequestException('Ce bon ne peut pas être contesté dans son statut actuel');

    // Vérifier qu'il n'y a pas déjà une contestation ouverte pour ce bon
    const existing = await this.prisma.contestation.findFirst({
      where: { bonId, status: { in: ['open', 'in_review'] } },
    });
    if (existing)
      throw new BadRequestException('Une contestation est déjà en cours pour ce bon');

    const contestation = await this.prisma.contestation.create({
      data: {
        bonId,
        userId,
        message,
        status: 'open',
      },
      include: {
        bon: { select: { id: true, reference: true } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });

    // Passer le bon en statut "contested" pour signaler visuellement
    await this.prisma.bon.update({
      where: { id: bonId },
      data: { status: 'contested' },
    });

    // Invalider tous les tokens de signature en attente pour éviter qu'un ancien lien
    // permette de signer pendant ou après la contestation
    await this.signatureService.invalidateUnsignedTokens(bonId);

    // Notifier les IT staff par email (fire and forget)
    this.notificationService
      .sendContestationAlert(bon, contestation.user, message)
      .catch(() => {});

    // Log d'audit (previousStatus stored for restoration on resolution)
    await this.prisma.auditLog.create({
      data: {
        bonId,
        userId,
        action: 'bon_contested',
        details: { message: message.substring(0, 200), previousStatus: bon.status },
      },
    });

    return contestation;
  }

  // ─── Liste pour l'IT (paginée, filtrable) ────────────────────────────────────

  async findAll(filters: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = filters;

    const where: Prisma.ContestationWhereInput = {};
    if (status) where.status = status as Prisma.EnumContestationStatusFilter;

    const [contestations, total] = await Promise.all([
      this.prisma.contestation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          bon: { select: { id: true, reference: true, status: true, filiale: { select: { displayName: true } } } },
          user: { select: { id: true, displayName: true, email: true } },
          resolvedBy: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.contestation.count({ where }),
    ]);

    return { contestations, total, page, limit };
  }

  // ─── Résoudre ou rejeter une contestation (IT) ───────────────────────────────

  /**
   * @param correct — flux « corriger et re-signer » (uniquement avec action
   *   'resolved') : le bon contesté est annulé et un brouillon pré-rempli est
   *   créé pour correction puis nouvelle signature. Sans ce drapeau, le bon
   *   revient simplement à son statut antérieur.
   */
  async resolve(
    id: string,
    resolvedById: string,
    action: 'resolved' | 'rejected',
    resolutionMessage?: string,
    correct = false,
  ) {
    const contestation = await this.prisma.contestation.findUnique({
      where: { id },
      include: {
        bon: { include: { filiale: true, collaborateur: { select: { id: true, displayName: true, email: true } } } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!contestation) throw new NotFoundException('Contestation introuvable');
    if (correct && action !== 'resolved')
      throw new BadRequestException('La correction n\'est possible que pour une contestation résolue');

    // Transaction unique : claim conditionnel de la contestation (deux
    // résolutions concurrentes → une seule gagne), changement de statut du bon
    // et création du brouillon corrigé. Si la duplication échoue (P2002, panne
    // DB…), TOUT est rollbacké — la contestation reste ouverte et rejouable.
    const correctedBon = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.contestation.updateMany({
        where: { id, status: { in: ['open', 'in_review'] } },
        data: {
          status: action,
          resolvedById,
          resolutionMessage: resolutionMessage ?? null,
          updatedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('Cette contestation est déjà clôturée');
      }

      if (correct) {
        // Le document contesté est annulé (il restait faux) et remplacé par un
        // brouillon corrigeable, lié à l'original dans l'audit des deux bons
        await tx.bon.update({
          where: { id: contestation.bonId },
          data: { status: 'cancelled' },
        });
        await tx.auditLog.create({
          data: {
            bonId: contestation.bonId,
            userId: resolvedById,
            action: 'bon_cancelled',
            details: { contestationId: id, reason: 'Contestation fondée — bon remplacé pour correction' },
          },
        });
        const draft = await this.bonsService.duplicateAsDraft(
          contestation.bonId,
          resolvedById,
          { contestationId: id },
          tx,
        );
        return { id: draft.id, reference: draft.reference };
      }

      // Restore the bon to its status before the contestation was opened.
      // The previous status is stored in the audit log entry for 'bon_contested'.
      const contestedAuditEntry = await tx.auditLog.findFirst({
        where: { bonId: contestation.bonId, action: 'bon_contested' },
        orderBy: { createdAt: 'desc' },
        select: { details: true },
      });
      const previousStatus =
        (contestedAuditEntry?.details as { previousStatus?: string } | null)?.previousStatus ?? 'active';

      await tx.bon.update({
        where: { id: contestation.bonId },
        data: { status: previousStatus as BonStatus },
      });
      return null;
    });

    // Notifier le collaborateur du résultat
    this.notificationService
      .sendContestationResolution(
        contestation.bon,
        contestation.user,
        action,
        resolutionMessage,
      )
      .catch(() => {});

    // Log d'audit
    await this.prisma.auditLog.create({
      data: {
        bonId: contestation.bonId,
        userId: resolvedById,
        action: action === 'resolved' ? 'contestation_resolved' : 'contestation_rejected',
        details: { contestationId: id, resolutionMessage, corrected: correct, correctedBonId: correctedBon?.id },
      },
    });

    const updated = await this.prisma.contestation.findUnique({
      where: { id },
      include: {
        bon: { select: { id: true, reference: true, status: true } },
        user: { select: { id: true, displayName: true, email: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    });

    return { ...updated, correctedBon };
  }

  // ─── Passer en "en cours d'examen" (IT) ─────────────────────────────────────

  async markInReview(id: string, reviewerId: string) {
    const contestation = await this.prisma.contestation.findUnique({ where: { id } });
    if (!contestation) throw new NotFoundException('Contestation introuvable');
    if (contestation.status !== 'open')
      throw new BadRequestException('Seules les contestations ouvertes peuvent être prises en charge');

    return this.prisma.contestation.update({
      where: { id },
      data: { status: 'in_review', resolvedById: reviewerId },
      include: {
        bon: { select: { id: true, reference: true } },
        user: { select: { id: true, displayName: true, email: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    });
  }
}
