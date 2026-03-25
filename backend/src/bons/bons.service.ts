import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBonDto, UpdateBonDto, BonEquipmentDto } from './dto/bon.dto';
import { SignatureService } from '../signature/signature.service';
import { NotificationService } from '../notification/notification.service';
import { PdfService, SigImages } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { STATUS_LABELS } from '../common/status-labels';
import { BonStatus, Civilite } from '../common/types';

// Explicit select to avoid loading large Bytes columns (pdfMiseDispoSnapshot, pdfRestitutionSnapshot).
// Use as query option spread: { where, ...BON_SELECT, orderBy, ... }
const BON_SELECT = {
  select: {
    id: true,
    reference: true,
    filialeId: true,
    collaborateurId: true,
    collaborateurEmail: true,
    createdById: true,
    civilite: true,
    status: true,
    dateMiseDisposition: true,
    dateRestitution: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    filiale: true,
    collaborateur: {
      select: { id: true, displayName: true, email: true, department: true },
    },
    createdBy: {
      select: { id: true, displayName: true, email: true },
    },
    equipments: {
      orderBy: { order: 'asc' as const },
      include: {
        catalogItem: {
          select: { id: true, brand: true, model: true, category: true },
        },
      },
    },
    signatures: true,
  },
} as const;

@Injectable()
export class BonsService {
  private readonly logger = new Logger(BonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureService: SignatureService,
    private readonly notificationService: NotificationService,
    private readonly pdfService: PdfService,
    private readonly smbService: SmbService,
  ) {}

  async getStats() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [waitingSignature, active, overdue, total, archivedThisMonth, filialesRaw] = await Promise.all([
      this.prisma.bon.count({
        where: { status: { in: ['sent_mise_dispo', 'sent_restitution', 'partially_returned'] } },
      }),
      this.prisma.bon.count({ where: { status: 'active' } }),
      this.prisma.bon.count({
        where: {
          status: { in: ['sent_mise_dispo', 'sent_restitution'] },
          updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.bon.count({
        where: { status: { notIn: ['cancelled', 'archived'] } },
      }),
      this.prisma.bon.count({
        where: { status: 'archived', updatedAt: { gte: monthStart } },
      }),
      this.prisma.filiale.findMany({
        where: { active: true },
        select: {
          id: true,
          displayName: true,
          _count: {
            select: {
              bons: { where: { status: { notIn: ['cancelled', 'archived'] } } },
            },
          },
        },
        orderBy: { displayName: 'asc' },
      }),
    ]);

    return {
      waitingSignature,
      active,
      overdue,
      total,
      archivedThisMonth,
      byFiliale: filialesRaw
        .map((f) => ({ id: f.id, name: f.displayName, count: f._count.bons }))
        .filter((f) => f.count > 0),
    };
  }

  async getExportData(filters: { status?: string; filialeId?: string; search?: string }) {
    const { status, filialeId, search } = filters;
    const where: Prisma.BonWhereInput = {};
    if (status) where.status = status as BonStatus;
    if (filialeId) where.filialeId = filialeId;
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { collaborateur: { displayName: { contains: search, mode: 'insensitive' } } },
        { collaborateur: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const bons = await this.prisma.bon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: {
        filiale: { select: { displayName: true } },
        collaborateur: { select: { displayName: true, email: true, department: true } },
        createdBy: { select: { displayName: true, email: true } },
        equipments: { include: { catalogItem: { select: { brand: true, model: true } } } },
        signatures: { where: { signed: true }, select: { type: true, signedAt: true } },
      },
    });

    const headers = [
      'Référence', 'Statut', 'Filiale', 'Collaborateur', 'Email collaborateur',
      'Service', 'Date mise à disposition', 'Date restitution', 'Nb équipements',
      'Équipements', 'Créé par', 'Date création',
      'Date signature mise à dispo', 'Date signature restitution',
    ];

    const escape = (v: string) => {
      let s = String(v).replace(/"/g, '""');
      // CSV injection protection: prefix formula-triggering characters with a single quote
      if (/^[=+\-@\t\r]/.test(s)) {
        s = "'" + s;
      }
      return `"${s}"`;
    };

    const rows = bons.map((b) => {
      const sigMise = b.signatures.find((s) => s.type === 'mise_disposition');
      const sigRest = b.signatures.find((s) => s.type === 'restitution');
      const equipLabel = b.equipments
        .map((e) =>
          e.catalogItem
            ? `${e.catalogItem.brand} ${e.catalogItem.model}`
            : e.customLabel ?? '',
        )
        .join(' | ');
      return [
        b.reference,
        STATUS_LABELS[b.status] ?? b.status,
        b.filiale.displayName,
        b.collaborateur.displayName,
        b.collaborateur.email,
        b.collaborateur.department ?? '',
        b.dateMiseDisposition ? new Date(b.dateMiseDisposition).toLocaleDateString('fr-FR') : '',
        b.dateRestitution ? new Date(b.dateRestitution).toLocaleDateString('fr-FR') : '',
        String(b.equipments.length),
        equipLabel,
        b.createdBy.displayName,
        new Date(b.createdAt).toLocaleDateString('fr-FR'),
        sigMise?.signedAt ? new Date(sigMise.signedAt).toLocaleDateString('fr-FR') : '',
        sigRest?.signedAt ? new Date(sigRest.signedAt).toLocaleDateString('fr-FR') : '',
      ].map(escape);
    });

    const csv = [headers.map(escape).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    return '\uFEFF' + csv; // BOM UTF-8 pour Excel
  }

  async findAll(filters: {
    status?: string;
    filialeId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, filialeId, search, page = 1, limit = 20 } = filters;
    const where: Prisma.BonWhereInput = {};

    if (status) where.status = status as BonStatus;
    if (filialeId) where.filialeId = filialeId;
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        {
          collaborateur: {
            displayName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          collaborateur: {
            email: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [bons, total] = await Promise.all([
      this.prisma.bon.findMany({
        where,
        ...BON_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bon.count({ where }),
    ]);

    return { bons, total, page, limit };
  }

  async findOne(id: string) {
    const bon = await this.prisma.bon.findUnique({
      where: { id },
      ...BON_SELECT,
    });
    if (!bon) throw new NotFoundException('Bon introuvable');
    return bon;
  }

  async create(dto: CreateBonDto, userId: string) {
    const reference = await this.generateReference();

    let equipments: Array<{ catalogItemId?: string; customLabel?: string; serialNumber?: string; inventoryNumber?: string; notes?: string; order?: number }> = dto.equipments || [];

    // Import from pack if specified
    if (dto.packId) {
      const pack = await this.prisma.equipmentPack.findUnique({
        where: { id: dto.packId },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: { catalogItem: true },
          },
        },
      });
      if (pack) {
        const packEquipments = pack.items.flatMap((item) =>
          Array.from({ length: item.quantity }, (_, i) => ({
            catalogItemId: item.catalogItemId,
            order: item.order * 10 + i,
          })),
        );
        equipments = [...packEquipments, ...equipments];
      }
    }

    const collaborateur = await this.prisma.user.findUnique({
      where: { id: dto.collaborateurId },
    });
    if (!collaborateur) throw new NotFoundException('Collaborateur introuvable');

    const bon = await this.prisma.bon.create({
      data: {
        reference,
        filialeId: dto.filialeId,
        collaborateurId: dto.collaborateurId,
        collaborateurEmail: collaborateur.email,
        createdById: userId,
        civilite: dto.civilite as Civilite,
        dateMiseDisposition: new Date(dto.dateMiseDisposition),
        dateRestitution: dto.dateRestitution
          ? new Date(dto.dateRestitution)
          : null,
        notes: dto.notes,
        equipments: {
          create: equipments.map((e, idx) => ({
            catalogItemId: e.catalogItemId || null,
            customLabel: e.customLabel || null,
            serialNumber: e.serialNumber || null,
            inventoryNumber: e.inventoryNumber || null,
            notes: e.notes || null,
            order: e.order ?? idx,
          })),
        },
      },
      ...BON_SELECT,
    });
    await this.prisma.auditLog.create({
      data: { bonId: bon.id, userId, action: 'bon_created' },
    });
    return bon;
  }

  async update(id: string, dto: UpdateBonDto) {
    const bon = await this.findOne(id);
    if (bon.status !== 'draft')
      throw new BadRequestException(
        'Seuls les brouillons peuvent être modifiés',
      );

    const data: Prisma.BonUncheckedUpdateInput = {};
    if (dto.filialeId) data.filialeId = dto.filialeId;
    if (dto.collaborateurId) {
      const collab = await this.prisma.user.findUnique({
        where: { id: dto.collaborateurId },
      });
      if (!collab) throw new NotFoundException('Collaborateur introuvable');
      data.collaborateurId = dto.collaborateurId;
      data.collaborateurEmail = collab.email;
    }
    if (dto.civilite) data.civilite = dto.civilite as Civilite;
    if (dto.dateMiseDisposition)
      data.dateMiseDisposition = new Date(dto.dateMiseDisposition);
    if (dto.dateRestitution !== undefined)
      data.dateRestitution = dto.dateRestitution
        ? new Date(dto.dateRestitution)
        : null;
    if (dto.notes !== undefined) data.notes = dto.notes;

    if (dto.equipments !== undefined) {
      await this.prisma.bonEquipment.deleteMany({ where: { bonId: id } });
      data.equipments = {
        create: dto.equipments.map((e, idx) => ({
          catalogItemId: e.catalogItemId || null,
          customLabel: e.customLabel || null,
          serialNumber: e.serialNumber || null,
          inventoryNumber: e.inventoryNumber || null,
          notes: e.notes || null,
          order: e.order ?? idx,
        })),
      };
    }

    return this.prisma.bon.update({ where: { id }, data, ...BON_SELECT });
  }

  async cancel(id: string, userId?: string) {
    const bon = await this.findOne(id);
    if (['archived', 'cancelled', 'contested'].includes(bon.status))
      throw new BadRequestException('Ce bon ne peut pas être annulé');
    // Invalidate all unsigned signature tokens
    await this.signatureService.invalidateUnsignedTokens(id);
    const updated = await this.prisma.bon.update({
      where: { id },
      data: { status: 'cancelled' },
      ...BON_SELECT,
    });
    await this.prisma.auditLog.create({
      data: { bonId: id, userId: userId ?? null, action: 'bon_cancelled' },
    });
    return updated;
  }

  async send(id: string, initiatedById?: string) {
    const bon = await this.findOne(id);
    if (bon.status !== 'draft')
      throw new BadRequestException('Seuls les brouillons peuvent être envoyés');
    if (bon.equipments.length === 0)
      throw new BadRequestException(
        'Le bon doit contenir au moins un équipement',
      );

    // Update status first
    const updated = await this.prisma.bon.update({
      where: { id },
      data: { status: 'sent_mise_dispo' },
      ...BON_SELECT,
    });

    // Generate signature token
    const sig = await this.signatureService.generateToken(
      id,
      'mise_disposition',
      initiatedById,
      false,
    );

    // Send email (fire and forget — ne pas bloquer si SMTP non configuré)
    this.notificationService
      .sendMiseDispositionRequest(updated, sig.token)
      .catch(() => {/* email errors are logged in NotificationService */});

    await this.prisma.auditLog.create({
      data: { bonId: id, userId: initiatedById ?? null, action: 'bon_sent' },
    });
    return updated;
  }

  async initiateRestitution(id: string, initiatedById?: string, returnedEquipmentIds?: string[]) {
    const bon = await this.findOne(id);
    if (!['active', 'partially_returned'].includes(bon.status))
      throw new BadRequestException(
        'La restitution ne peut être initiée que sur un bon actif ou partiellement restitué',
      );

    // Mark selected equipments as returned
    if (returnedEquipmentIds && returnedEquipmentIds.length > 0) {
      await this.prisma.bonEquipment.updateMany({
        where: {
          id: { in: returnedEquipmentIds },
          bonId: id,
          returnedAt: null,
          notReturned: false,
        },
        data: { returnedAt: new Date() },
      });
    }

    // Check if all equipments are now returned or declared not-returned
    const remaining = await this.prisma.bonEquipment.count({
      where: { bonId: id, returnedAt: null, notReturned: false },
    });

    const allReturned = remaining === 0;
    const newStatus: BonStatus = allReturned ? 'sent_restitution' : 'partially_returned';

    const updated = await this.prisma.bon.update({
      where: { id },
      data: { status: newStatus },
      ...BON_SELECT,
    });

    // Generate signature token for restitution (even partial — to sign what's been returned)
    const sig = await this.signatureService.generateToken(
      id,
      'restitution',
      initiatedById,
      false,
    );

    // Send email
    this.notificationService
      .sendRestitutionRequest(updated, sig.token)
      .catch(() => {});

    await this.prisma.auditLog.create({
      data: { bonId: id, userId: initiatedById ?? null, action: 'restitution_initiated' },
    });
    return updated;
  }

  async declareNotReturned(
    id: string,
    equipmentIds: string[],
    reason: string,
    userId: string,
    signatureDataUrl?: string,
  ) {
    const bon = await this.findOne(id);
    if (!['active', 'partially_returned', 'sent_restitution'].includes(bon.status))
      throw new BadRequestException('Action impossible sur ce bon');

    if (!equipmentIds?.length) throw new BadRequestException('Aucun équipement sélectionné');

    if (signatureDataUrl && !signatureDataUrl.startsWith('data:image/')) {
      throw new BadRequestException('La signature doit être une image valide (data:image/...)');
    }

    // Wrap equipment update + audit log + status change in a transaction
    const remaining = await this.prisma.$transaction(async (tx) => {
      // Mark equipments as not returned
      await tx.bonEquipment.updateMany({
        where: {
          id: { in: equipmentIds },
          bonId: id,
          returnedAt: null,
        },
        data: { notReturned: true, notReturnedReason: reason },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          bonId: id,
          userId,
          action: 'declare_not_returned',
          details: { equipmentIds, reason },
        },
      });

      // Check if all equipments are now resolved (returned or not returned)
      const count = await tx.bonEquipment.count({
        where: { bonId: id, returnedAt: null, notReturned: false },
      });

      // Always update status to partially_returned while waiting for PV signature
      await tx.bon.update({
        where: { id },
        data: { status: 'partially_returned' },
      });

      return count;
    });

    if (remaining === 0) {
      // All resolved → generate PV with IT signature, send to collab for co-signature
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      const signerEmail = user?.email ?? 'unknown';

      // Save IT signature as it_cachet record
      if (signatureDataUrl) {
        await this.signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
      }

      // Reload bon with fresh signatures
      const updatedBon = await this.prisma.bon.findUniqueOrThrow({
        where: { id },
        ...BON_SELECT,
      });

      // Generate PV PDF with IT signature only (collab not yet signed)
      const collabName = this.smbService.sanitizeName(
        updatedBon.collaborateur?.displayName || 'INCONNU',
      );
      const filename = `${updatedBon.reference}_${collabName}_cloture_equipements_manquants.pdf`;
      const sigImages: SigImages = { it: signatureDataUrl || null, collab: null };
      const pdfBuffer = await this.pdfService.generateAndSave(
        updatedBon,
        'cloture_equipements_manquants',
        sigImages,
        filename,
      );
      this.smbService.exportPdf(updatedBon, filename, pdfBuffer).catch(() => {});

      // Create pv_cloture token for collab co-signature
      const pvSig = await this.signatureService.generateToken(id, 'pv_cloture', userId, false);

      // Send PV email to collab
      this.notificationService.sendPvClotureRequest(updatedBon, pvSig.token).catch(() => {});

      this.logger.log(`Bon ${updatedBon.reference} — PV cloture envoyé au collaborateur pour signature`);
    }

    return this.findOne(id);
  }

  /**
   * IT marks previously not-returned equipment as found.
   * - Bon archived: generates an IT-only avenant PDF, bon stays archived.
   * - Bon partially_returned (PV pending collab): regenerates PV, sends new pv_cloture token.
   */
  async markFound(
    id: string,
    equipmentIds: string[],
    userId: string,
    signatureDataUrl?: string,
  ) {
    const bon = await this.findOne(id);
    if (!['partially_returned', 'active', 'archived'].includes(bon.status))
      throw new BadRequestException('Action impossible sur ce bon');

    if (!equipmentIds?.length) throw new BadRequestException('Aucun équipement sélectionné');

    if (signatureDataUrl && !signatureDataUrl.startsWith('data:image/')) {
      throw new BadRequestException('La signature doit être une image valide (data:image/...)');
    }

    // Wrap equipment update + audit log in a transaction for atomicity
    await this.prisma.$transaction(async (tx) => {
      // Mark equipment as found (returned)
      await tx.bonEquipment.updateMany({
        where: {
          id: { in: equipmentIds },
          bonId: id,
          notReturned: true,
        },
        data: { notReturned: false, notReturnedReason: null, returnedAt: new Date() },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          bonId: id,
          userId,
          action: 'mark_found',
          details: { equipmentIds, wasArchived: bon.status === 'archived' },
        },
      });
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const signerEmail = user?.email ?? 'unknown';

    // Save IT signature
    if (signatureDataUrl) {
      await this.signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
    }

    // Reload bon with fresh data + signatures
    const updatedBon = await this.prisma.bon.findUniqueOrThrow({
      where: { id },
      ...BON_SELECT,
    });

    const collabName = this.smbService.sanitizeName(
      updatedBon.collaborateur?.displayName || 'INCONNU',
    );

    if (bon.status === 'archived') {
      // ── Bon already archived: generate IT-only avenant, keep archived ──────
      const filename = `${updatedBon.reference}_${collabName}_avenant_equipement_retrouve.pdf`;
      const sigImages: SigImages = { it: signatureDataUrl || null, collab: null };

      // Pass found equipment IDs so the PDF renders only those
      const bonWithContext = { ...updatedBon, _avenantEquipmentIds: equipmentIds };
      const pdfBuffer = await this.pdfService.generateAndSave(
        bonWithContext,
        'avenant_equipement_retrouve',
        sigImages,
        filename,
      );
      this.smbService.exportPdf(updatedBon, filename, pdfBuffer).catch(() => {});

      this.logger.log(
        `Bon ${updatedBon.reference} (archivé) — avenant IT généré pour équipement retrouvé`,
      );
    } else {
      // Check if all not-returned equipment is now resolved
      const stillNotReturned = await this.prisma.bonEquipment.count({
        where: { bonId: id, notReturned: true },
      });

      if (stillNotReturned === 0) {
        // ── All equipment found → advance to sent_restitution ──────────────
        await this.prisma.bon.update({
          where: { id },
          data: { status: 'sent_restitution' },
        });

        const sig = await this.signatureService.generateToken(id, 'restitution', userId, false);
        this.notificationService.sendRestitutionRequest(updatedBon, sig.token).catch(() => {});

        this.logger.log(
          `Bon ${updatedBon.reference} — tous les équipements retrouvés, passage en restitution`,
        );
      } else {
        // ── Still has not-returned items: regenerate PV, send pv_cloture ──
        const filename = `${updatedBon.reference}_${collabName}_cloture_equipements_manquants.pdf`;
        const sigImages: SigImages = { it: signatureDataUrl || null, collab: null };
        const pdfBuffer = await this.pdfService.generateAndSave(
          updatedBon,
          'cloture_equipements_manquants',
          sigImages,
          filename,
        );
        this.smbService.exportPdf(updatedBon, filename, pdfBuffer).catch(() => {});

        const pvSig = await this.signatureService.generateToken(id, 'pv_cloture', userId, false);
        this.notificationService.sendPvClotureRequest(updatedBon, pvSig.token).catch(() => {});

        this.logger.log(
          `Bon ${updatedBon.reference} — PV mis à jour (équipement retrouvé), renvoyé au collaborateur`,
        );
      }
    }

    return this.findOne(id);
  }

  async initiateInPersonSignature(
    id: string,
    type: 'mise_disposition' | 'restitution',
    initiatedById: string,
  ) {
    const bon = await this.findOne(id);
    const allowedStatuses: Record<string, string[]> = {
      mise_disposition: ['draft'],
      restitution: ['active', 'partially_returned'],
    };

    if (!allowedStatuses[type]?.includes(bon.status)) {
      throw new BadRequestException(
        `Impossible d'initier une signature présentielle pour un bon en statut "${bon.status}"`,
      );
    }

    // Pour la restitution en présentiel, marquer tous les équipements non encore traités comme rendus
    if (type === 'restitution') {
      await this.prisma.bonEquipment.updateMany({
        where: { bonId: id, returnedAt: null, notReturned: false },
        data: { returnedAt: new Date() },
      });
    }

    // Update bon status
    const newStatus: BonStatus = type === 'mise_disposition' ? 'sent_mise_dispo' : 'sent_restitution';
    const updated = await this.prisma.bon.update({
      where: { id },
      data: { status: newStatus },
      ...BON_SELECT,
    });

    // Generate in-person token (7-day validity, same as remote)
    const sig = await this.signatureService.generateToken(id, type, initiatedById, true);

    return { bon: updated, token: sig.token };
  }

  async getRecentBons(limit = 10) {
    return this.prisma.bon.findMany({
      ...BON_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByCollaborateur(userId: string) {
    return this.prisma.bon.findMany({
      where: {
        collaborateurId: userId,
        status: { notIn: ['cancelled'] },
      },
      ...BON_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Renvoi manuel du lien de signature (depuis BonDetail par l'IT).
   * Génère un nouveau token et renvoie l'email correspondant.
   */
  async resendSignatureLink(bonId: string, initiatedById: string, force = false) {
    const bon = await this.findOne(bonId);

    if (!['sent_mise_dispo', 'sent_restitution', 'partially_returned'].includes(bon.status))
      throw new BadRequestException(
        'Le renvoi est possible uniquement pour les bons en attente de signature',
      );

    // Guard: if a valid token was sent less than 1 hour ago, require explicit confirmation
    if (!force) {
      const recentSig = await this.prisma.signature.findFirst({
        where: {
          bonId,
          signed: false,
          tokenExpiresAt: { gt: new Date(1000) }, // exclude invalidated tokens (epoch)
          createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recentSig) {
        throw new ConflictException({
          code: 'token_recent',
          sentAt: recentSig.createdAt.toISOString(),
        });
      }
    }

    // Check if there's a pending pv_cloture signature (PV awaiting collab co-signature)
    const hasPendingPvCloture = bon.signatures?.some(
      (s) => s.type === 'pv_cloture' && !s.signed && new Date() < new Date(s.tokenExpiresAt),
    );

    if (hasPendingPvCloture) {
      const sig = await this.signatureService.generateToken(bonId, 'pv_cloture', initiatedById, false);
      this.notificationService.sendPvClotureRequest(bon, sig.token).catch(() => {});
    } else {
      const type: 'mise_disposition' | 'restitution' =
        ['sent_restitution', 'partially_returned'].includes(bon.status) ? 'restitution' : 'mise_disposition';

      // Invalider le token précédent et en générer un nouveau
      const sig = await this.signatureService.generateToken(bonId, type, initiatedById, false);

      // Renvoyer l'email
      if (type === 'restitution') {
        this.notificationService
          .sendRestitutionRequest(bon, sig.token)
          .catch(() => {});
      } else {
        this.notificationService
          .sendMiseDispositionRequest(bon, sig.token)
          .catch(() => {});
      }
    }

    // Log d'audit
    await this.prisma.auditLog.create({
      data: {
        bonId,
        userId: initiatedById,
        action: 'reminder_sent',
        details: { manual: true },
      },
    });

    return { ok: true, message: 'Lien renvoyé avec succès' };
  }

  private async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `BON-${year}-`;
    // Advisory lock sérialise les générations concurrentes au niveau PostgreSQL.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bon_reference_lock'))`;
      const lastBon = await tx.bon.findFirst({
        where: { reference: { startsWith: yearPrefix } },
        orderBy: { reference: 'desc' },
        select: { reference: true },
      });
      const nextNum = lastBon
        ? parseInt(lastBon.reference.split('-')[2], 10) + 1
        : 1;
      return `BON-${year}-${String(nextNum).padStart(4, '0')}`;
    });
  }
}
