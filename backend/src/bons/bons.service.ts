import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBonDto, UpdateBonDto, BonEquipmentDto } from './dto/bon.dto';
import { SignatureService } from '../signature/signature.service';
import { NotificationService } from '../notification/notification.service';
import { PdfService, SigImages } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { STATUS_LABELS } from '../common/status-labels';
import { BonStatus, Civilite, BON_SELECT_SHAPE, SIGNATURE_SAFE_SELECT } from '../common/types';
import { generateBonReference } from '../common/bon-reference';

// Canonical select shape: no Bytes columns, signatures restricted to API-safe
// fields (no token / signerIp / signerUserAgent / signatureImagePath).
const BON_SELECT = BON_SELECT_SHAPE;

// Modèle d'accès « IT centrale » (décision produit 2026-06-11) : les techniciens
// ont accès à toutes les filiales, au même titre que les admins. La filiale
// reste une donnée du bon (logo, tampon, arborescence d'archivage SMB).

/** Recherche libre : référence, nom/email du collaborateur, ou n° de série d'un équipement. */
function buildSearchClauses(search: string): Prisma.BonWhereInput[] {
  return [
    { reference: { contains: search, mode: 'insensitive' } },
    { collaborateur: { displayName: { contains: search, mode: 'insensitive' } } },
    { collaborateur: { email: { contains: search, mode: 'insensitive' } } },
    { equipments: { some: { serialNumber: { contains: search, mode: 'insensitive' } } } },
  ];
}

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

    const [waitingSignature, active, overdue, total, archivedThisMonth, partiallyReturned, filialesRaw] = await Promise.all([
      this.prisma.bon.count({
        where: {
          OR: [
            { status: { in: ['sent_mise_dispo', 'sent_restitution'] } },
            {
              status: 'partially_returned',
              // Only count signatures whose token is still valid (invalidated
              // tokens are set to epoch and would inflate the counter forever)
              signatures: {
                some: {
                  signed: false,
                  type: { in: ['restitution', 'pv_cloture'] },
                  tokenExpiresAt: { gt: new Date() },
                },
              },
            },
          ],
        },
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
      this.prisma.bon.count({ where: { status: 'partially_returned' } }),
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
      partiallyReturned,
      byFiliale: filialesRaw
        .map((f) => ({ id: f.id, name: f.displayName, count: f._count.bons }))
        .filter((f) => f.count > 0),
    };
  }

  async getExportData(filters: { status?: BonStatus[]; filialeId?: string; search?: string }) {
    const { status, filialeId, search } = filters;
    const where: Prisma.BonWhereInput = {};
    if (status?.length) {
      where.status = { in: status };
    }
    if (filialeId) where.filialeId = filialeId;
    if (search) {
      where.OR = buildSearchClauses(search);
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
    status?: BonStatus[];
    excludeStatus?: BonStatus[];
    filialeId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, excludeStatus, filialeId, search, page = 1, limit = 20 } = filters;
    const where: Prisma.BonWhereInput = {};

    // status and excludeStatus combine (AND) instead of one silently overriding the other
    if (status?.length || excludeStatus?.length) {
      where.status = {
        ...(status?.length ? { in: status } : {}),
        ...(excludeStatus?.length ? { notIn: excludeStatus } : {}),
      };
    }
    if (filialeId) where.filialeId = filialeId;
    if (search) {
      where.OR = buildSearchClauses(search);
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
    if (dto.dateRestitution && dto.dateRestitution < dto.dateMiseDisposition) {
      throw new BadRequestException(
        'La date de restitution ne peut pas précéder la date de mise à disposition',
      );
    }

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

    // Référence et INSERT dans la MÊME transaction : le verrou advisory de
    // generateBonReference est relâché au commit — s'il était relâché avant
    // l'insertion, deux créations concurrentes obtiendraient le même numéro
    // (violation d'unicité P2002 sur la seconde)
    const bon = await this.prisma.$transaction(async (tx) => {
      const reference = await generateBonReference(tx);
      return tx.bon.create({
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

    const effectiveMiseDispo =
      dto.dateMiseDisposition ?? new Date(bon.dateMiseDisposition).toISOString().slice(0, 10);
    const effectiveRestitution =
      dto.dateRestitution !== undefined
        ? dto.dateRestitution
        : bon.dateRestitution
          ? new Date(bon.dateRestitution).toISOString().slice(0, 10)
          : null;
    if (effectiveRestitution && effectiveRestitution < effectiveMiseDispo) {
      throw new BadRequestException(
        'La date de restitution ne peut pas précéder la date de mise à disposition',
      );
    }

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

    // Atomicité : (1) re-vérifier le statut DANS la transaction — un send()
    // concurrent entre le findOne ci-dessus et l'écriture transformerait sinon
    // un bon déjà envoyé ; (2) delete + recreate des équipements rollbackés
    // ensemble si l'update échoue (FK invalide, erreur DB).
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.bon.findUnique({ where: { id }, select: { status: true } });
      if (fresh?.status !== 'draft') {
        throw new ConflictException('Ce bon n\'est plus un brouillon — il a été envoyé entre-temps');
      }
      if (dto.equipments !== undefined) {
        await tx.bonEquipment.deleteMany({ where: { bonId: id } });
      }
      return tx.bon.update({ where: { id }, data, ...BON_SELECT });
    });
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
    // Notify the collaborator if a signature request had already been sent
    if (['sent_mise_dispo', 'sent_restitution', 'partially_returned'].includes(bon.status)) {
      this.notificationService.sendCancellationNotice(updated).catch(() => {});
    }
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

    // Conditional transition: a concurrent send loses the race instead of
    // re-running the whole flow (duplicate tokens + duplicate emails)
    const transition = await this.prisma.bon.updateMany({
      where: { id, status: 'draft' },
      data: { status: 'sent_mise_dispo' },
    });
    if (transition.count === 0) {
      throw new ConflictException('Ce bon a déjà été envoyé');
    }
    const updated = await this.prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

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
      const marked = await this.prisma.bonEquipment.updateMany({
        where: {
          id: { in: returnedEquipmentIds },
          bonId: id,
          returnedAt: null,
          notReturned: false,
        },
        data: { returnedAt: new Date() },
      });
      if (marked.count === 0) {
        throw new BadRequestException(
          'Aucun des équipements sélectionnés n\'est en attente de restitution sur ce bon',
        );
      }
    }

    // Pending = neither returned nor declared lost. Lost equipment (notReturned)
    // is NOT "returned": it must go through the co-signed PV de clôture flow.
    const [remaining, notReturnedCount] = await Promise.all([
      this.prisma.bonEquipment.count({
        where: { bonId: id, returnedAt: null, notReturned: false },
      }),
      this.prisma.bonEquipment.count({ where: { bonId: id, notReturned: true } }),
    ]);

    // Nothing newly returned and only lost equipment left → the pending action
    // is the PV co-signature, not a restitution: don't clobber that flow.
    if (remaining === 0 && notReturnedCount > 0 && (!returnedEquipmentIds || returnedEquipmentIds.length === 0)) {
      throw new BadRequestException(
        'Tous les équipements restants sont déclarés non rendus — le procès-verbal de clôture est en attente de co-signature',
      );
    }

    const fullyReturned = remaining === 0 && notReturnedCount === 0;
    const newStatus: BonStatus = fullyReturned ? 'sent_restitution' : 'partially_returned';

    const updated = await this.prisma.bon.update({
      where: { id },
      data: { status: newStatus },
      ...BON_SELECT,
    });

    // Invalidate any token from a previous flow (e.g. a stale pv_cloture link)
    // before issuing the restitution token
    await this.signatureService.invalidateUnsignedTokens(id);

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
      const marked = await tx.bonEquipment.updateMany({
        where: {
          id: { in: equipmentIds },
          bonId: id,
          returnedAt: null,
        },
        data: { notReturned: true, notReturnedReason: reason },
      });
      // Reject ids that don't belong to this bon / are already returned —
      // otherwise the state machine advances with nothing actually changed
      if (marked.count !== equipmentIds.length) {
        throw new BadRequestException(
          'Certains équipements sélectionnés n\'appartiennent pas à ce bon ou sont déjà restitués',
        );
      }

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

      // A stale mise-dispo/restitution token must not stay signable now that
      // the pending action is the PV co-signature
      await this.signatureService.invalidateUnsignedTokens(id);

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
      this.smbService.exportPdf(updatedBon, filename, pdfBuffer).catch((err) =>
        this.logger.error(`Échec export SMB [${updatedBon.reference}]: ${(err as Error).message}`),
      );

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
    // 'active' is excluded: an active bon has no notReturned equipment, and the
    // no-op updateMany used to propel it straight into sent_restitution
    if (!['partially_returned', 'archived'].includes(bon.status))
      throw new BadRequestException('Action impossible sur ce bon');

    if (!equipmentIds?.length) throw new BadRequestException('Aucun équipement sélectionné');

    if (signatureDataUrl && !signatureDataUrl.startsWith('data:image/')) {
      throw new BadRequestException('La signature doit être une image valide (data:image/...)');
    }

    // Wrap equipment update + audit log in a transaction for atomicity
    await this.prisma.$transaction(async (tx) => {
      // Mark equipment as found (returned)
      const marked = await tx.bonEquipment.updateMany({
        where: {
          id: { in: equipmentIds },
          bonId: id,
          notReturned: true,
        },
        data: { notReturned: false, notReturnedReason: null, returnedAt: new Date() },
      });
      if (marked.count !== equipmentIds.length) {
        throw new BadRequestException(
          'Certains équipements sélectionnés ne sont pas déclarés non rendus sur ce bon',
        );
      }

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
      this.smbService.exportPdf(updatedBon, filename, pdfBuffer).catch((err) =>
        this.logger.error(`Échec export SMB [${updatedBon.reference}]: ${(err as Error).message}`),
      );

      this.logger.log(
        `Bon ${updatedBon.reference} (archivé) — avenant IT généré pour équipement retrouvé`,
      );
      // Inform the collaborator that the previously-lost equipment was found
      this.notificationService.sendMarkFoundNotice(updatedBon, equipmentIds).catch(() => {});
    } else {
      // Check if all not-returned equipment is now resolved
      const stillNotReturned = await this.prisma.bonEquipment.count({
        where: { bonId: id, notReturned: true },
      });

      // The old pv_cloture (or restitution) link must not stay signable after
      // this transition — a stale signed PV would corrupt the new state
      await this.signatureService.invalidateUnsignedTokens(id);

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
        this.smbService.exportPdf(updatedBon, filename, pdfBuffer).catch((err) =>
          this.logger.error(`Échec export SMB [${updatedBon.reference}]: ${(err as Error).message}`),
        );

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
      select: {
        ...BON_SELECT.select,
        // The portal needs the pending link token to offer "Signer maintenant" —
        // safe here: these are the collaborator's own bons.
        signatures: { select: { ...SIGNATURE_SAFE_SELECT, token: true } },
      },
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

    // PV pending is determined from the BUSINESS state, not the token validity:
    // an expired pv_cloture link must be re-sent as a PV, not as a restitution
    // (which would leave the PV unsigned and the bon stuck in partially_returned)
    const notReturnedCount = bon.equipments.filter((e) => e.notReturned).length;
    const pendingReturnCount = bon.equipments.filter((e) => !e.returnedAt && !e.notReturned).length;
    const hasUnsignedPv = bon.signatures?.some((s) => s.type === 'pv_cloture' && !s.signed) ?? false;
    const hasPendingPvCloture =
      bon.status === 'partially_returned' &&
      notReturnedCount > 0 &&
      pendingReturnCount === 0 &&
      hasUnsignedPv;

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


  /**
   * Clôture unilatérale par l'IT (collaborateur injoignable, parti, ou silence
   * prolongé) : le bon avance sans signature collaborateur, avec motif
   * obligatoire, mention explicite sur le document PDF et traçage audit.
   * - sent_mise_dispo      → active   (remise constatée sans signature)
   * - sent_restitution     → archived (restitution constatée sans signature)
   * - partially_returned   → archived (PV constaté sans co-signature — exige
   *   que tous les équipements soient restitués ou déclarés non rendus)
   */
  async closeUnilaterally(id: string, userId: string, reason: string) {
    const bon = await this.findOne(id);
    const allowed: BonStatus[] = ['sent_mise_dispo', 'sent_restitution', 'partially_returned'];
    if (!allowed.includes(bon.status as BonStatus)) {
      throw new BadRequestException(
        'La clôture unilatérale n\'est possible que sur un bon en attente de signature',
      );
    }

    if (bon.status === 'partially_returned') {
      const pending = await this.prisma.bonEquipment.count({
        where: { bonId: id, returnedAt: null, notReturned: false },
      });
      if (pending > 0) {
        throw new BadRequestException(
          'Des équipements ne sont ni restitués ni déclarés non rendus — traitez-les avant de clôturer',
        );
      }
    }

    const newStatus: BonStatus = bon.status === 'sent_mise_dispo' ? 'active' : 'archived';

    // Invalider les tokens AVANT la transition : une signature en vol échoue
    // alors sur la re-vérification d'expiration de sa propre transaction, au
    // lieu d'aboutir silencieusement sur un bon « clôturé sans signature »
    // (sent_mise_dispo→active n'est pas dans la liste bloquée de sign()).
    await this.signatureService.invalidateUnsignedTokens(id);

    // Transition conditionnelle : une signature déjà commitée ou un autre
    // changement concurrent gagne la course plutôt que d'être écrasé
    const transition = await this.prisma.bon.updateMany({
      where: { id, status: bon.status as BonStatus },
      data: { status: newStatus },
    });
    if (transition.count === 0) {
      throw new ConflictException('Le statut du bon a changé entre-temps — rechargez la page');
    }

    const closer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    await this.prisma.auditLog.create({
      data: {
        bonId: id,
        userId,
        action: 'bon_closed_unilateral',
        details: { from: bon.status, to: newStatus, reason },
      },
    });

    const updated = await this.prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

    // Document de l'étape avec mention de clôture unilatérale dans la case de
    // signature collaborateur (le hash SHA-256 est tracé par generateAndSave)
    const note =
      `CLÔTURE UNILATÉRALE — constaté sans signature du collaborateur le ` +
      `${new Date().toLocaleDateString('fr-FR')} par ${closer?.displayName ?? 'le service IT'}. Motif : ${reason}`;
    const snapshotType =
      bon.status === 'sent_mise_dispo'
        ? 'signature_collab_mise_disposition'
        : bon.status === 'sent_restitution'
          ? 'signature_collab_restitution'
          : 'cloture_equipements_manquants';

    const fullSignatures = await this.prisma.signature.findMany({ where: { bonId: id } });
    const sigImages = await this.signatureService.getSignatureImagesForBon(fullSignatures);
    sigImages.collab = null; // pas de signature collaborateur, par définition

    const collabName = this.smbService.sanitizeName(updated.collaborateur?.displayName || 'INCONNU');
    const filename = `${updated.reference}_${collabName}_${snapshotType}_cloture_unilaterale.pdf`;
    // Les signatures complètes (avec signatureImagePath) sont nécessaires au
    // rendu PDF pour les dates de signature du cachet IT
    const bonForPdf = { ...updated, signatures: fullSignatures, _unilateralNote: note };

    // Si un document de cette étape existe déjà (ex. restitution partielle
    // réellement signée par le collaborateur), ne JAMAIS l'écraser : le constat
    // unilatéral part en archivage SMB sous un nom distinct, hash tracé en audit.
    const existingSnap = await this.prisma.pdfSnapshot.findUnique({
      where: { bonId_type: { bonId: id, type: snapshotType } },
      select: { id: true },
    });
    let pdfBuffer: Buffer;
    if (existingSnap) {
      pdfBuffer = await this.pdfService.generateBonPdf(
        bonForPdf,
        sigImages,
        this.pdfService.getDocumentType(snapshotType),
      );
      try {
        await this.prisma.auditLog.create({
          data: {
            bonId: id,
            userId,
            action: 'pdf_snapshot_saved',
            details: {
              type: `${snapshotType}_cloture_unilaterale`,
              filename,
              sha256: createHash('sha256').update(pdfBuffer).digest('hex'),
              smbOnly: true,
            },
          },
        });
      } catch { /* non-blocking */ }
    } else {
      pdfBuffer = await this.pdfService.generateAndSave(bonForPdf, snapshotType, sigImages, filename);
    }
    this.smbService.exportPdf(updated, filename, pdfBuffer).catch((err) =>
      this.logger.error(`Échec export SMB [${updated.reference}]: ${(err as Error).message}`),
    );

    // Informer le collaborateur (adresse peut-être désactivée — fire & forget)
    this.notificationService.sendUnilateralCloseNotice(updated, reason, newStatus).catch(() => {});

    this.logger.log(`Bon ${updated.reference} clôturé unilatéralement (${bon.status} → ${newStatus}) par ${closer?.email}`);
    return this.findOne(id);
  }

  /**
   * Duplique un bon en brouillon (correction après contestation fondée) :
   * mêmes filiale/collaborateur/dates/notes/équipements, nouvelle référence.
   * Le lien avec l'original est tracé dans l'audit des deux bons.
   * Accepte un TransactionClient pour s'inscrire dans la transaction de
   * l'appelant (résolution de contestation) — la référence et l'INSERT restent
   * alors couverts par le même verrou advisory.
   */
  async duplicateAsDraft(
    sourceBonId: string,
    userId: string,
    context?: { contestationId?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const source = await client.bon.findUnique({
        where: { id: sourceBonId },
        include: { equipments: { orderBy: { order: 'asc' } } },
      });
      if (!source) throw new NotFoundException('Bon source introuvable');

      const reference = await generateBonReference(client);
      const bon = await client.bon.create({
        data: {
          reference,
          filialeId: source.filialeId,
          collaborateurId: source.collaborateurId,
          collaborateurEmail: source.collaborateurEmail,
          createdById: userId,
          civilite: source.civilite,
          dateMiseDisposition: source.dateMiseDisposition,
          dateRestitution: source.dateRestitution,
          notes: source.notes,
          equipments: {
            create: source.equipments.map((e, idx) => ({
              catalogItemId: e.catalogItemId,
              customLabel: e.customLabel,
              serialNumber: e.serialNumber,
              inventoryNumber: e.inventoryNumber,
              notes: e.notes,
              order: e.order ?? idx,
            })),
          },
        },
        ...BON_SELECT,
      });

      await client.auditLog.create({
        data: {
          bonId: bon.id,
          userId,
          action: 'bon_created',
          details: { correctedFrom: source.reference, sourceBonId, ...context },
        },
      });
      await client.auditLog.create({
        data: {
          bonId: sourceBonId,
          userId,
          action: 'bon_corrected',
          details: { correctedTo: bon.reference, newBonId: bon.id, ...context },
        },
      });

      return bon;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }
}
