import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BonStatus } from '../common/types';
import { BON_REFERENCE_TX_OPTIONS } from '../common/bon-reference';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { SignatureService } from '../signature/signature.service';
import { BonsService } from '../bons/bons.service';

@Injectable()
export class ContestationService {
  private readonly logger = new Logger(ContestationService.name);

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

    // Transaction unique : vérification "pas déjà ouverte" + création + passage
    // du bon en "contested" sont atomiques — un double clic concurrent ne peut
    // plus créer deux contestations, ni contester un bon déjà changé de statut
    // entre la lecture ci-dessus et l'écriture.
    const contestation = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.contestation.findFirst({
        where: { bonId, status: { in: ['open', 'in_review'] } },
      });
      if (existing) throw new ConflictException('Une contestation est déjà ouverte');

      const created = await tx.contestation.create({
        data: { bonId, userId, message, status: 'open' },
        include: {
          bon: { select: { id: true, reference: true } },
          user: { select: { id: true, displayName: true, email: true } },
        },
      });

      const claimed = await tx.bon.updateMany({
        where: { id: bonId, status: 'active' },
        data: { status: 'contested' },
      });
      if (claimed.count === 0) {
        throw new ConflictException("Le bon n'est plus contestable");
      }

      return created;
    });

    // Invalider tous les tokens de signature en attente pour éviter qu'un ancien lien
    // permette de signer pendant ou après la contestation
    await this.signatureService.invalidateUnsignedTokens(bonId);

    // Notifier les IT staff par email (fire and forget)
    this.notificationService
      .sendContestationAlert(bon, contestation.user, message)
      .catch((err: unknown) =>
        this.logger.warn(
          `Alerte contestation non envoyée pour le bon ${bonId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

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

    const [contestations, total, openCount] = await Promise.all([
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
      // Indépendant des filtres/pagination — compteur global pour le badge IT
      this.prisma.contestation.count({ where: { status: 'open' } }),
    ]);

    return { contestations, total, page, limit, openCount };
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
    // BON_REFERENCE_TX_OPTIONS (timeout 10s) : duplicateAsDraft → generateBonReference
    // pose un verrou advisory qui peut dépasser le timeout Prisma par défaut (5s).
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

      // Garde-fou : le bon doit toujours être au statut "contested" à cet
      // instant (lecture fraîche, pas celle faite avant la transaction) avant
      // de le restaurer ou de l'annuler — il a pu être modifié entre-temps par
      // un autre traitement concurrent.
      const freshBon = await tx.bon.findUnique({ where: { id: contestation.bonId }, select: { status: true } });
      if (freshBon?.status !== 'contested') {
        throw new ConflictException("Ce bon n'est plus au statut contesté");
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
    }, BON_REFERENCE_TX_OPTIONS);

    // Notifier le collaborateur du résultat
    this.notificationService
      .sendContestationResolution(
        contestation.bon,
        contestation.user,
        action,
        resolutionMessage,
      )
      .catch((err: unknown) =>
        this.logger.warn(
          `Notification de résolution non envoyée pour la contestation ${id}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

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
