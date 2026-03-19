import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ContestationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
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
    if (!['active', 'sent_restitution'].includes(bon.status))
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

    // Notifier les IT staff par email (fire and forget)
    this.notificationService
      .sendContestationAlert(bon, contestation.user, message)
      .catch(() => {});

    // Log d'audit
    await this.prisma.auditLog.create({
      data: {
        bonId,
        userId,
        action: 'bon_contested',
        details: { message: message.substring(0, 200) },
      },
    });

    return contestation;
  }

  // ─── Liste pour l'IT (paginée, filtrable) ────────────────────────────────────

  async findAll(filters: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = filters;

    const where: any = {};
    if (status) where.status = status;

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

  async resolve(
    id: string,
    resolvedById: string,
    action: 'resolved' | 'rejected',
    resolutionMessage?: string,
  ) {
    const contestation = await this.prisma.contestation.findUnique({
      where: { id },
      include: {
        bon: { include: { filiale: true, collaborateur: { select: { id: true, displayName: true, email: true } } } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!contestation) throw new NotFoundException('Contestation introuvable');
    if (!['open', 'in_review'].includes(contestation.status))
      throw new BadRequestException('Cette contestation est déjà clôturée');

    const updated = await this.prisma.contestation.update({
      where: { id },
      data: {
        status: action,
        resolvedById,
        resolutionMessage: resolutionMessage ?? null,
        updatedAt: new Date(),
      },
      include: {
        bon: { select: { id: true, reference: true, status: true } },
        user: { select: { id: true, displayName: true, email: true } },
        resolvedBy: { select: { id: true, displayName: true } },
      },
    });

    // Si résolu (accepté), le bon retourne en "active" ; si rejeté, aussi
    // Dans les deux cas on rétablit le statut "active" (la contestation est traitée)
    await this.prisma.bon.update({
      where: { id: contestation.bonId },
      data: { status: 'active' },
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
        details: { contestationId: id, resolutionMessage },
      },
    });

    return updated;
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
