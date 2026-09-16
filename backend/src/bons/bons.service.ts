import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBonDto, UpdateBonDto } from './dto/bon.dto';
import { SignatureService } from '../signature/signature.service';
import { NotificationService } from '../notification/notification.service';
import { PdfService } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { AppConfigService } from '../config/config.service';
import { STATUS_LABELS } from '../common/status-labels';
import { BonStatus, Civilite, BON_SELECT_SHAPE, SIGNATURE_SAFE_SELECT } from '../common/types';
import { generateBonReference, BON_REFERENCE_TX_OPTIONS } from '../common/bon-reference';
import { assertPngDataUrl } from '../common/signature-data-url';
import { generateSignatureToken } from '../common/tokens';
import {
  escapeCsvCell,
  CLOSED_BON_STATUSES,
  WAITING_SIGNATURE_STATUSES,
  PARTIAL_PENDING_SIGNATURE_TYPES,
  buildOverdueSignatureWhere,
  INVALIDATED_TOKEN_SENTINEL,
  DEFAULT_SIGNATURE_OVERDUE_DAYS,
} from '../common/bon-predicates';

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
    private readonly configService: AppConfigService,
  ) {}

  /** Statuts pour lesquels un équipement non rendu est considéré « en
   *  circulation » — même liste que EquipmentService.findSerialConflicts
   *  (dupliquée ici : equipment/** est hors périmètre, et l'injecter
   *  imposerait de toucher bons.module.ts, également hors périmètre). */
  private static readonly ACTIVE_BON_STATUSES_FOR_SERIAL_CONFLICTS: BonStatus[] = [
    'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
  ];

  /** Numéros de série du bon `excludeBonId` déjà en circulation sur un AUTRE
   *  bon actif — équivalent de EquipmentService.findSerialConflicts, réécrit
   *  ici car equipment/** est hors périmètre du lot A2. */
  private async findSerialConflicts(
    serials: string[],
    excludeBonId: string,
  ): Promise<Array<{ serialNumber: string; bonReference: string }>> {
    // Même plafond que EquipmentService.findSerialConflicts (garde-fou contre
    // une requête IN() démesurée).
    const cleaned = [...new Set(serials.map((s) => s.trim()).filter(Boolean))].slice(0, 50);
    if (cleaned.length === 0) return [];

    const conflicts = await this.prisma.bonEquipment.findMany({
      where: {
        serialNumber: { in: cleaned, mode: 'insensitive' },
        returnedAt: null,
        notReturned: false,
        bon: {
          status: { in: BonsService.ACTIVE_BON_STATUSES_FOR_SERIAL_CONFLICTS },
          id: { not: excludeBonId },
        },
      },
      include: { bon: { select: { reference: true } } },
    });

    return conflicts.map((c) => ({
      serialNumber: c.serialNumber as string,
      bonReference: c.bon.reference,
    }));
  }

  /** Vérifie qu'une filiale existe et est active — sinon 404. */
  private async assertFilialeUsable(filialeId: string): Promise<void> {
    const filiale = await this.prisma.filiale.findUnique({
      where: { id: filialeId },
      select: { active: true },
    });
    if (!filiale?.active) {
      throw new NotFoundException('Filiale introuvable ou inactive');
    }
  }

  /** Vérifie que chaque article de catalogue référencé existe et est actif —
   *  sinon 400 listant les ids en cause. */
  private async assertCatalogItemsUsable(catalogItemIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(catalogItemIds)];
    if (uniqueIds.length === 0) return;

    const items = await this.prisma.equipmentCatalog.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, active: true },
    });
    const activeById = new Map(items.map((item) => [item.id, item.active]));
    const invalidIds = uniqueIds.filter((id) => activeById.get(id) !== true);

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Article(s) de catalogue introuvable(s) ou inactif(s) : ${invalidIds.join(', ')}`,
      );
    }
  }

  /** Normalise un équipement fourni par le client : trim des champs texte,
   *  chaîne vide → null. */
  private normalizeEquipmentInput(
    e: { catalogItemId?: string; customLabel?: string; serialNumber?: string; inventoryNumber?: string; notes?: string; order?: number },
    idx: number,
  ) {
    const trimOrNull = (v?: string): string | null => {
      const t = v?.trim();
      return t ? t : null;
    };
    return {
      catalogItemId: e.catalogItemId || null,
      customLabel: trimOrNull(e.customLabel),
      serialNumber: trimOrNull(e.serialNumber),
      inventoryNumber: trimOrNull(e.inventoryNumber),
      notes: e.notes || null,
      order: e.order ?? idx,
    };
  }

  /** Rejette les numéros de série dupliqués (trim, insensible à la casse) au
   *  sein d'un même bon. */
  private assertNoDuplicateSerials(equipments: Array<{ serialNumber: string | null }>): void {
    const seen = new Set<string>();
    for (const e of equipments) {
      if (!e.serialNumber) continue;
      const key = e.serialNumber.toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException(`Numéro de série en double dans ce bon : ${e.serialNumber}`);
      }
      seen.add(key);
    }
  }

  /** Un bon est « envoyable » (send() ou initiation présentielle mise à
   *  disposition) si : au moins un équipement, chaque équipement référence un
   *  article du catalogue OU une désignation libre, le collaborateur est actif
   *  et la filiale est active. */
  private async assertSendable(bon: {
    collaborateurId: string;
    filiale: { active: boolean } | null;
    equipments: Array<{ catalogItemId: string | null; customLabel: string | null }>;
  }): Promise<void> {
    if (bon.equipments.length === 0) {
      throw new BadRequestException('Le bon doit contenir au moins un équipement');
    }
    const hasInvalidEquipment = bon.equipments.some(
      (e) => !e.catalogItemId && !(e.customLabel && e.customLabel.trim()),
    );
    if (hasInvalidEquipment) {
      throw new BadRequestException(
        'Chaque équipement doit référencer un article du catalogue ou une désignation libre',
      );
    }
    if (!bon.filiale?.active) {
      throw new BadRequestException('La filiale est inactive');
    }
    const collaborateur = await this.prisma.user.findUnique({
      where: { id: bon.collaborateurId },
      select: { active: true },
    });
    if (!collaborateur?.active) {
      throw new BadRequestException('Le collaborateur est désactivé');
    }
  }

  /** Construit le where Prisma partagé par findAll, getExportData et
   *  getStats. `overdueDays` — seuil (jours) de retard de signature,
   *  définition unique partagée avec `/bons/stats` et `/kpi/delais`
   *  (`common/bon-predicates.buildOverdueSignatureWhere`). */
  private buildBonWhere(
    filters: {
      status?: BonStatus[];
      excludeStatus?: BonStatus[];
      filialeId?: string;
      search?: string;
      overdue?: boolean;
    },
    overdueDays: number = DEFAULT_SIGNATURE_OVERDUE_DAYS,
  ): Prisma.BonWhereInput {
    const { status, excludeStatus, filialeId, search, overdue } = filters;
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
    if (overdue) {
      where.AND = [buildOverdueSignatureWhere(overdueDays)];
    }
    return where;
  }

  /** Durée de validité (jours) du token pv_cloture — même réglage admin-
   *  configurable que SignatureService.generateToken (tokens.expiry_days),
   *  dupliqué ici car nécessaire à l'intérieur du verrou advisory de
   *  emitPvClotureIfDue (voir ce commentaire pour le pourquoi). */
  private async getPvTokenValidityDays(): Promise<number> {
    const DEFAULT_DAYS = 7;
    const raw = await this.configService.get('tokens', 'expiry_days');
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
    return Math.min(30, Math.max(1, parsed));
  }

  /**
   * Enveloppe pdfService.generateAndSave : celui-ci persiste désormais
   * ProofArchive + PdfSnapshot + audit dans une transaction et REMONTE toute
   * erreur (lot E) au lieu de l'avaler. Dans tous les appelants ci-dessous, la
   * signature/transition métier est déjà commitée AVANT cet appel — une
   * exception ici ne doit donc pas se traduire par un 500 qui masquerait une
   * action pourtant réussie. On logge, on trace un audit `pdf_snapshot_failed`
   * (régénérable ensuite via POST /admin/pdf/regenerate-missing), et on
   * renvoie null : l'appelant saute alors l'export SMB (pas de buffer) sans
   * échouer la requête.
   */
  private async generateAndSaveSnapshot(
    bonId: string,
    ...args: Parameters<PdfService['generateAndSave']>
  ): Promise<Buffer | null> {
    const [, snapshotType] = args;
    try {
      return await this.pdfService.generateAndSave(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Échec génération/sauvegarde du snapshot PDF [${snapshotType}] pour le bon ${bonId} (action déjà effectuée, non bloquant) : ${message}`,
      );
      await this.prisma.auditLog
        .create({
          data: { bonId, action: 'pdf_snapshot_failed', details: { type: snapshotType, error: message } },
        })
        .catch(() => undefined);
      return null;
    }
  }

  async getNotificationLogs(bonId: string) {
    await this.findOne(bonId); // throws 404 if not found
    return this.prisma.notificationLog.findMany({
      where: { bonId },
      orderBy: { sentAt: 'desc' },
    });
  }

  async getStats() {
    // UTC (pas l'heure locale du serveur) : un serveur dans un fuseau à l'ouest
    // de l'UTC décalerait sinon le début de mois d'une journée.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const overdueThresholdDays = await this.configService.getSignatureOverdueDays();
    const closedStatuses = [...CLOSED_BON_STATUSES];

    const [waitingSignature, active, overdue, total, archivedThisMonth, partiallyReturned, filialesRaw] = await Promise.all([
      this.prisma.bon.count({
        where: {
          OR: [
            { status: { in: [...WAITING_SIGNATURE_STATUSES] } },
            {
              status: 'partially_returned',
              // tokenExpiresAt > sentinelle (epoch + 1s) exclut uniquement les
              // tokens invalidés VOLONTAIREMENT (resend, contestation, clôture) —
              // un token simplement expiré naturellement reste « en attente »,
              // aligné sur le cron de rappels (common/bon-predicates).
              signatures: {
                some: {
                  signed: false,
                  type: { in: [...PARTIAL_PENDING_SIGNATURE_TYPES] },
                  tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
                },
              },
            },
          ],
        },
      }),
      this.prisma.bon.count({ where: { status: 'active' } }),
      // Même définition que le filtre GET /bons?overdue=1 (buildBonWhere) : le
      // chiffre du tableau de bord doit correspondre à la liste obtenue après
      // clic — sinon partially_returned avec signature en attente était compté
      // dans la liste mais pas dans ce total.
      this.prisma.bon.count({ where: this.buildBonWhere({ overdue: true }, overdueThresholdDays) }),
      this.prisma.bon.count({
        where: { status: { notIn: closedStatuses } },
      }),
      // archivedAt (jamais updatedAt) : seul ce champ trace le moment réel de
      // l'archivage — updatedAt bouge pour d'autres raisons après coup.
      this.prisma.bon.count({
        where: { status: 'archived', archivedAt: { gte: monthStart } },
      }),
      this.prisma.bon.count({ where: { status: 'partially_returned' } }),
      this.prisma.filiale.findMany({
        where: { active: true },
        select: {
          id: true,
          displayName: true,
          _count: {
            select: {
              bons: { where: { status: { notIn: closedStatuses } } },
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
      overdueThresholdDays,
      byFiliale: filialesRaw
        .map((f) => ({ id: f.id, name: f.displayName, count: f._count.bons }))
        .filter((f) => f.count > 0),
    };
  }

  async getExportData(filters: {
    status?: BonStatus[];
    excludeStatus?: BonStatus[];
    filialeId?: string;
    search?: string;
    overdue?: boolean;
  }): Promise<{ csv: string; truncated: boolean }> {
    const EXPORT_LIMIT = 5000;
    const overdueThresholdDays = await this.configService.getSignatureOverdueDays();
    const where = this.buildBonWhere(filters, overdueThresholdDays);

    const rowsFetched = await this.prisma.bon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT + 1,
      include: {
        filiale: { select: { displayName: true } },
        collaborateur: { select: { displayName: true, email: true, department: true } },
        createdBy: { select: { displayName: true, email: true } },
        equipments: { include: { catalogItem: { select: { brand: true, model: true } } } },
        signatures: { where: { signed: true }, select: { type: true, signedAt: true } },
      },
    });
    const truncated = rowsFetched.length > EXPORT_LIMIT;
    const bons = truncated ? rowsFetched.slice(0, EXPORT_LIMIT) : rowsFetched;

    const headers = [
      'Référence', 'Statut', 'Filiale', 'Collaborateur', 'Email collaborateur',
      'Service', 'Date mise à disposition', 'Date restitution', 'Nb équipements',
      'Équipements', 'Créé par', 'Date création',
      'Date signature mise à dispo', 'Date signature restitution',
    ];

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
      ].map(escapeCsvCell);
    });

    const csv = [headers.map(escapeCsvCell).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    return { csv: '\uFEFF' + csv, truncated }; // BOM UTF-8 pour Excel
  }

  async findAll(filters: {
    status?: BonStatus[];
    excludeStatus?: BonStatus[];
    filialeId?: string;
    search?: string;
    overdue?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const overdueThresholdDays = await this.configService.getSignatureOverdueDays();
    const where = this.buildBonWhere(filters, overdueThresholdDays);

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

    await this.assertFilialeUsable(dto.filialeId);

    const collaborateur = await this.prisma.user.findUnique({
      where: { id: dto.collaborateurId },
    });
    if (!collaborateur) throw new NotFoundException('Collaborateur introuvable');
    if (!collaborateur.active) throw new BadRequestException('Le collaborateur est désactivé');

    let equipments = (dto.equipments || []).map((e, idx) => this.normalizeEquipmentInput(e, idx));

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
      if (!pack || !pack.active) {
        throw new NotFoundException('Pack introuvable ou inactif');
      }
      // Les items dont l'article de catalogue est désactivé sont ignorés à
      // l'import — un pack peut contenir un article devenu inactif entre-temps.
      const activeItems = pack.items.filter((item) => item.catalogItem.active);
      const packEquipments = activeItems.flatMap((item) =>
        Array.from({ length: item.quantity }, (_, i) => ({
          catalogItemId: item.catalogItemId as string | null,
          customLabel: null as string | null,
          serialNumber: null as string | null,
          inventoryNumber: null as string | null,
          notes: null as string | null,
          order: item.order * 10 + i,
        })),
      );
      equipments = [...packEquipments, ...equipments];
    }

    const catalogIds = equipments.map((e) => e.catalogItemId).filter((id): id is string => !!id);
    await this.assertCatalogItemsUsable(catalogIds);
    this.assertNoDuplicateSerials(equipments);

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
          equipments: { create: equipments },
        },
        ...BON_SELECT,
      });
    }, BON_REFERENCE_TX_OPTIONS);
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
    if (dto.filialeId) {
      await this.assertFilialeUsable(dto.filialeId);
      data.filialeId = dto.filialeId;
    }
    if (dto.collaborateurId) {
      const collab = await this.prisma.user.findUnique({
        where: { id: dto.collaborateurId },
      });
      if (!collab) throw new NotFoundException('Collaborateur introuvable');
      if (!collab.active) throw new BadRequestException('Le collaborateur est désactivé');
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
    if (dto.notes !== undefined) {
      // '' efface la note (persistée comme null) ; undefined = inchangé (cf. ci-dessus).
      data.notes = dto.notes.trim() === '' ? null : dto.notes;
    }

    if (dto.equipments !== undefined) {
      const normalizedEquipments = dto.equipments.map((e, idx) => this.normalizeEquipmentInput(e, idx));
      const catalogIds = normalizedEquipments.map((e) => e.catalogItemId).filter((cid): cid is string => !!cid);
      await this.assertCatalogItemsUsable(catalogIds);
      this.assertNoDuplicateSerials(normalizedEquipments);
      data.equipments = { create: normalizedEquipments };
    }

    // Atomicité : (1) claim conditionnel du statut DANS la transaction (comme
    // partout ailleurs dans ce fichier) — un send() concurrent entre le
    // findOne ci-dessus et l'écriture perd alors la course au lieu de voir un
    // bon déjà envoyé silencieusement réécrit ; (2) delete + recreate des
    // équipements rollbackés ensemble si l'update échoue (FK invalide, erreur DB).
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.bon.updateMany({ where: { id, status: 'draft' }, data: {} });
      if (claimed.count === 0) {
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
    // Seuls les brouillons et les bons en attente de signature mise-à-disposition
    // peuvent être annulés. Dès qu'une signature a eu lieu (statut active ou
    // ultérieur), l'annulation est bloquée au profit de la restitution ou de
    // la clôture unilatérale.
    if (!['draft', 'sent_mise_dispo'].includes(bon.status)) {
      throw new BadRequestException('Ce bon ne peut plus être annulé une fois signé');
    }

    // Transition conditionnelle D'ABORD : si une signature s'est committée
    // entre le findOne et ici (course), elle a fait avancer le statut hors de
    // {draft, sent_mise_dispo} — on ne l'écrase pas avec 'cancelled'.
    const transition = await this.prisma.bon.updateMany({
      where: { id, status: { in: ['draft', 'sent_mise_dispo'] } },
      data: { status: 'cancelled' },
    });
    if (transition.count === 0) {
      throw new ConflictException('Le statut du bon a changé entre-temps — rechargez la page');
    }
    // Invalidation ENSUITE, seulement si la transition a gagné la course
    // (cohérent avec closeUnilaterally).
    await this.signatureService.invalidateUnsignedTokens(id);

    const updated = await this.prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });
    await this.prisma.auditLog.create({
      data: { bonId: id, userId: userId ?? null, action: 'bon_cancelled' },
    });
    // Notify the collaborator if a signature request had already been sent
    if (bon.status === 'sent_mise_dispo') {
      this.notificationService.sendCancellationNotice(updated).catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));
    }
    return updated;
  }

  async send(id: string, initiatedById?: string, confirmSerialConflicts = false) {
    const bon = await this.findOne(id);
    if (bon.status !== 'draft')
      throw new BadRequestException('Seuls les brouillons peuvent être envoyés');
    await this.assertSendable(bon);

    const serials = bon.equipments.map((e) => e.serialNumber).filter((s): s is string => !!s);
    const serialConflicts = await this.findSerialConflicts(serials, id);
    if (serialConflicts.length > 0 && !confirmSerialConflicts) {
      throw new ConflictException({ code: 'serial_conflicts', conflicts: serialConflicts });
    }

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
      .catch((err: unknown) => this.logger.error(`Email send (${id}): ${err}`));

    await this.prisma.auditLog.create({
      data: { bonId: id, userId: initiatedById ?? null, action: 'bon_sent' },
    });
    if (serialConflicts.length > 0 && confirmSerialConflicts) {
      await this.prisma.auditLog.create({
        data: {
          bonId: id,
          userId: initiatedById ?? null,
          action: 'bon_sent_with_serial_conflicts',
          details: { conflicts: serialConflicts },
        },
      });
    }
    return updated;
  }

  async initiateRestitution(id: string, initiatedById?: string, returnedEquipmentIds?: string[]) {
    const bon = await this.findOne(id);
    if (!['active', 'partially_returned'].includes(bon.status))
      throw new BadRequestException(
        'La restitution ne peut être initiée que sur un bon actif ou partiellement restitué',
      );

    if (!returnedEquipmentIds?.length) {
      throw new BadRequestException('Sélectionnez au moins un équipement à restituer');
    }
    const ids = [...new Set(returnedEquipmentIds)];

    // Marquage des équipements + calcul du nouveau statut + transition
    // conditionnelle dans LA MÊME transaction : une annulation/contestation
    // concurrente entre le findOne ci-dessus et l'écriture ne doit pas être
    // écrasée par une transition calculée sur un statut périmé.
    await this.prisma.$transaction(async (tx) => {
      const marked = await tx.bonEquipment.updateMany({
        where: {
          id: { in: ids },
          bonId: id,
          returnedAt: null,
          notReturned: false,
        },
        data: { returnedAt: new Date() },
      });
      if (marked.count !== ids.length) {
        // Message spécifique quand la sélection ne contient QUE des
        // équipements déjà déclarés non rendus : le blocage n'est pas une
        // erreur de sélection mais l'attente de co-signature du PV en cours.
        const allDeclaredNotReturned = await tx.bonEquipment.count({
          where: { id: { in: ids }, bonId: id, notReturned: true },
        });
        if (allDeclaredNotReturned === ids.length) {
          throw new BadRequestException(
            'Tous les équipements restants sont déclarés non rendus : le PV de clôture est en attente de co-signature',
          );
        }
        throw new BadRequestException(
          "Certains équipements n'appartiennent pas à ce bon ou sont déjà restitués",
        );
      }

      // Pending = neither returned nor declared lost. Lost equipment (notReturned)
      // is NOT "returned": it must go through the co-signed PV de clôture flow.
      const [remaining, notReturnedCount] = await Promise.all([
        tx.bonEquipment.count({
          where: { bonId: id, returnedAt: null, notReturned: false },
        }),
        tx.bonEquipment.count({ where: { bonId: id, notReturned: true } }),
      ]);

      const fullyReturned = remaining === 0 && notReturnedCount === 0;
      const txNewStatus: BonStatus = fullyReturned ? 'sent_restitution' : 'partially_returned';

      const transition = await tx.bon.updateMany({
        where: { id, status: { in: ['active', 'partially_returned'] } },
        data: { status: txNewStatus },
      });
      if (transition.count === 0) {
        throw new ConflictException('Le statut du bon a changé, rechargez la page');
      }

      return { newStatus: txNewStatus };
    });

    const updated = await this.prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

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
      .catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));

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
    const ids = [...new Set(equipmentIds)];

    // Valider le PNG AVANT toute écriture : sinon la transaction ci-dessous se
    // commite (équipements marqués perdus) et la signature échoue ensuite avec
    // un état partiel (pas de PV, pas de token).
    if (signatureDataUrl) {
      assertPngDataUrl(signatureDataUrl);
    }

    // Une signature de restitution en attente ne doit pas être écrasée par une
    // déclaration de non-restitution pendant qu'elle est en vol chez le
    // collaborateur (la restitution de ce qui a déjà été rendu serait perdue).
    await this.assertNoPendingRestitutionSignature(id);

    // Wrap equipment update + audit log + status change in a transaction
    const remaining = await this.prisma.$transaction(async (tx) => {
      // Mark equipments as not returned (notReturned:false dans le where :
      // une ré-déclaration d'un équipement déjà déclaré non rendu est rejetée
      // plutôt que silencieusement acceptée)
      const marked = await tx.bonEquipment.updateMany({
        where: {
          id: { in: ids },
          bonId: id,
          returnedAt: null,
          notReturned: false,
        },
        data: { notReturned: true, notReturnedReason: reason },
      });
      // Reject ids that don't belong to this bon / are already returned —
      // otherwise the state machine advances with nothing actually changed
      if (marked.count !== ids.length) {
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
          details: { equipmentIds: ids, reason },
        },
      });

      // Check if all equipments are now resolved (returned or not returned)
      const count = await tx.bonEquipment.count({
        where: { bonId: id, returnedAt: null, notReturned: false },
      });

      // Always update status to partially_returned while waiting for PV signature.
      // Transition conditionnelle : un cancel/contestation concurrent gagne la
      // course plutôt que d'être écrasé.
      const transition = await tx.bon.updateMany({
        where: { id, status: { in: ['active', 'sent_restitution', 'partially_returned'] } },
        data: { status: 'partially_returned' },
      });
      if (transition.count === 0) {
        throw new ConflictException('Le statut du bon a changé, rechargez la page');
      }

      return count;
    });

    if (remaining > 0) {
      // Des équipements restent ni rendus ni déclarés : pas encore de PV
      // complet. La signature IT est conservée immédiatement pour le futur PV
      // — sinon elle serait validée puis silencieusement perdue, et le bon se
      // bloquerait.
      if (signatureDataUrl) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        await this.signatureService.saveItPvSignature(id, signatureDataUrl, user?.email ?? 'unknown', userId);
      }
      await this.prisma.auditLog.create({
        data: {
          bonId: id,
          userId,
          action: 'declare_not_returned_partial',
          details: { remaining, message: 'Équipements restants à traiter avant émission du PV' },
        },
      });
      this.logger.log(`Bon ${id} — non-rendus déclarés, ${remaining} équipement(s) restant(s) à traiter avant le PV`);
    } else {
      // All resolved → generate PV with IT signature, send to collab for
      // co-signature. Pas d'invalidateUnsignedTokens ici (hors verrou) : un
      // appel préalable pourrait, en cas de course, invalider le token
      // pv_cloture déjà committé par une requête concurrente juste avant que
      // son propre contrôle d'idempotence ne le voie — emitPvClotureIfDue
      // invalide déjà les tokens d'un autre type DANS son verrou advisory.
      const emitted = await this.emitPvClotureIfDue(id, signatureDataUrl, userId);
      if (!emitted) {
        this.logger.warn(
          `Bon ${id} — PV clôture non émis après declareNotReturned (conditions non réunies ou déjà en attente)`,
        );
      }
    }

    return this.findOne(id);
  }

  /**
   * IT marks previously not-returned equipment as found.
   * - Bon archived: generates an IT-only avenant PDF, bon stays archived.
   * - Bon partially_returned :
   *   - des équipements restent en attente de restitution (jamais traités par
   *     initiateRestitution) → rien n'est émis, juste l'audit + la signature IT ;
   *   - plus rien en attente et plus aucun non-rendu → passage en sent_restitution ;
   *   - plus rien en attente mais des équipements restent non rendus → PV régénéré.
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
    const ids = [...new Set(equipmentIds)];

    if (signatureDataUrl) {
      assertPngDataUrl(signatureDataUrl);
    }

    // Une signature de restitution en attente ne doit pas être écrasée par un
    // marquage "retrouvé" pendant qu'elle est en vol chez le collaborateur.
    await this.assertNoPendingRestitutionSignature(id);

    // Marquage des équipements + calcul de l'état résultant + transition
    // conditionnelle (le cas échéant) dans LA MÊME transaction.
    const { pending, advancedToRestitution } = await this.prisma.$transaction(async (tx) => {
      // Mark equipment as found (returned)
      const marked = await tx.bonEquipment.updateMany({
        where: {
          id: { in: ids },
          bonId: id,
          notReturned: true,
        },
        data: { notReturned: false, notReturnedReason: null, returnedAt: new Date() },
      });
      if (marked.count !== ids.length) {
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
          details: { equipmentIds: ids, wasArchived: bon.status === 'archived' },
        },
      });

      if (bon.status === 'archived') {
        // Rien d'autre à calculer : le bon reste archivé, avenant IT-only.
        return { pending: 0, stillNotReturned: 0, advancedToRestitution: false };
      }

      // Pending = équipements ni rendus ni déclarés non rendus (jamais traités
      // par initiateRestitution). Tant qu'il en reste, ni PV ni restitution ne
      // doivent être émis — le bon reste partially_returned en silence.
      const [pendingCount, stillNotReturnedCount] = await Promise.all([
        tx.bonEquipment.count({ where: { bonId: id, returnedAt: null, notReturned: false } }),
        tx.bonEquipment.count({ where: { bonId: id, notReturned: true } }),
      ]);

      let advanced = false;
      if (pendingCount === 0 && stillNotReturnedCount === 0) {
        // ── All equipment resolved → advance to sent_restitution ──────────
        const transition = await tx.bon.updateMany({
          where: { id, status: 'partially_returned' },
          data: { status: 'sent_restitution' },
        });
        if (transition.count === 0) {
          throw new ConflictException('Le statut du bon a changé, rechargez la page');
        }
        advanced = true;
      }

      return { pending: pendingCount, stillNotReturned: stillNotReturnedCount, advancedToRestitution: advanced };
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const signerEmail = user?.email ?? 'unknown';

    if (bon.status === 'archived') {
      // ── Bon already archived: generate IT-only avenant, keep archived ──────
      if (signatureDataUrl) {
        await this.signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
      }

      // Reload bon + fresh full signatures (signatureImagePath/signerIp/UA
      // requis pour un certificat de preuve complet — cf. correction #5)
      const updatedBon = await this.prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });
      const fullSignatures = await this.prisma.signature.findMany({ where: { bonId: id } });
      const sigImages = await this.signatureService.getSignatureImagesForBon(fullSignatures);
      if (signatureDataUrl) sigImages.it = signatureDataUrl;

      const collabName = this.smbService.sanitizeName(updatedBon.collaborateur?.displayName || 'INCONNU');
      const filename = `${updatedBon.reference}_${collabName}_avenant_equipement_retrouve.pdf`;

      // Pass found equipment IDs so the PDF renders only those
      const bonWithContext = { ...updatedBon, signatures: fullSignatures, _avenantEquipmentIds: ids };
      const pdfBuffer = await this.generateAndSaveSnapshot(
        id,
        bonWithContext,
        'avenant_equipement_retrouve',
        sigImages,
        filename,
      );
      if (pdfBuffer) {
        this.smbService.exportPdf(updatedBon, filename, pdfBuffer).catch((err) =>
          this.logger.error(`Échec export SMB [${updatedBon.reference}]: ${(err as Error).message}`),
        );
      }

      this.logger.log(
        `Bon ${updatedBon.reference} (archivé) — avenant IT généré pour équipement retrouvé`,
      );
      // Inform the collaborator that the previously-lost equipment was found
      this.notificationService.sendMarkFoundNotice(updatedBon, ids).catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));
      return this.findOne(id);
    }

    if (pending > 0) {
      // Des équipements restent en attente de restitution (jamais traités par
      // initiateRestitution) : ni PV ni token tant qu'ils ne sont pas résolus.
      // La signature IT est conservée immédiatement pour ne pas être perdue.
      if (signatureDataUrl) {
        await this.signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
      }
      await this.prisma.auditLog.create({
        data: {
          bonId: id,
          userId,
          action: 'mark_found_partial',
          details: { pending, message: 'Équipements encore en attente de restitution avant PV/restitution' },
        },
      });
      this.logger.log(
        `Bon ${id} — équipement(s) retrouvé(s), ${pending} équipement(s) encore en attente de restitution`,
      );
      return this.findOne(id);
    }

    if (advancedToRestitution) {
      // ── All equipment found → advance to sent_restitution ──────────────
      // L'ancien lien (pv_cloture ou restitution résiduel) ne doit pas rester
      // signable après cette transition — generateToken() est appelé
      // directement ici (pas emitPvClotureIfDue), donc pas de verrou advisory
      // à respecter : l'invalidation préalable reste sûre.
      await this.signatureService.invalidateUnsignedTokens(id);
      if (signatureDataUrl) {
        await this.signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
      }
      const updatedBon = await this.prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });
      const sig = await this.signatureService.generateToken(id, 'restitution', userId, false);
      this.notificationService.sendRestitutionRequest(updatedBon, sig.token).catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));

      this.logger.log(
        `Bon ${updatedBon.reference} — tous les équipements retrouvés, passage en restitution`,
      );
    } else {
      // ── Still has not-returned items, nothing pending → PV de clôture ───
      // Pas d'invalidateUnsignedTokens ici (hors verrou) : un appel préalable
      // pourrait, en cas de course, invalider le token pv_cloture déjà
      // committé par une requête concurrente juste avant que son propre
      // contrôle d'idempotence ne le voie — emitPvClotureIfDue invalide déjà
      // les tokens d'un autre type DANS son verrou advisory.
      const emitted = await this.emitPvClotureIfDue(id, signatureDataUrl, userId);
      if (!emitted) {
        this.logger.warn(
          `Bon ${id} — PV clôture non émis après markFound (conditions non réunies ou déjà en attente)`,
        );
      }
    }

    return this.findOne(id);
  }

  /**
   * Émet le procès-verbal de clôture (équipements non rendus) si — et
   * seulement si — le bon est réellement dans cet état : partially_returned,
   * aucun équipement encore en attente de restitution, et au moins un
   * équipement déclaré non rendu. Idempotent : un token pv_cloture non signé
   * et non expiré déjà en cours n'est jamais régénéré.
   *
   * Contrat public réutilisé par declareNotReturned, markFound (LOT A1) et par
   * signature.service après une signature de restitution (LOT B) : NE PAS
   * renommer / changer la signature sans coordination.
   *
   * Atomicité : le contrôle d'idempotence (aucun token pv_cloture en attente)
   * ET la création du token sont couverts par un verrou advisory Postgres
   * (pg_advisory_xact_lock, comme generateBonReference) posé DANS une même
   * transaction interactive — deux appels concurrents (double clic « Renvoyer »,
   * ou declareNotReturned + markFound quasi simultanés) ne peuvent donc plus
   * produire deux PV/emails/ProofArchive : le second voit le token fraîchement
   * créé par le premier dès que le verrou se libère et s'arrête là. Les tokens
   * en attente d'un AUTRE type sont également invalidés dans cette même
   * transaction (plus besoin qu'un appelant le fasse au préalable). Le
   * PDF/email restent émis après le commit (best-effort, non bloquants).
   *
   * @param bonId ID du bon.
   * @param itSignatureDataUrl Signature IT fraîche à persister (optionnelle) —
   *   si absente, la signature IT déjà en base (le cas échéant) est réutilisée.
   * @param actorId Utilisateur à l'origine de l'émission (technicien).
   * @returns true si le PV a été émis (PDF + token + email), false sinon.
   */
  async emitPvClotureIfDue(
    bonId: string,
    itSignatureDataUrl?: string,
    actorId?: string,
  ): Promise<boolean> {
    const bon = await this.prisma.bon.findUnique({ where: { id: bonId }, ...BON_SELECT });
    if (!bon || bon.status !== 'partially_returned') return false;

    const [pending, notReturnedCount] = await Promise.all([
      this.prisma.bonEquipment.count({ where: { bonId, returnedAt: null, notReturned: false } }),
      this.prisma.bonEquipment.count({ where: { bonId, notReturned: true } }),
    ]);
    if (pending > 0 || notReturnedCount === 0) return false;

    if (itSignatureDataUrl) {
      assertPngDataUrl(itSignatureDataUrl);
    }

    const validityDays = await this.getPvTokenValidityDays();

    const claimedToken = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pv_cloture:' || ${bonId}::text))`;

      // Idempotence (sous verrou) : un PV déjà en attente de co-signature
      // (token valide) ne doit pas être régénéré.
      const existingPvToken = await tx.signature.findFirst({
        where: { bonId, type: 'pv_cloture', signed: false, tokenExpiresAt: { gt: new Date() } },
      });
      if (existingPvToken) return null;

      // Tout token en attente d'un autre type (mise_disposition/restitution
      // résiduel) est invalidé avant l'émission du PV, dans la même
      // transaction que le verrou.
      await tx.signature.updateMany({
        where: { bonId, signed: false, tokenExpiresAt: { gt: new Date(1000) } },
        data: { tokenExpiresAt: new Date(0) },
      });

      const token = generateSignatureToken();
      const tokenExpiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
      const created = await tx.signature.create({
        data: {
          bonId,
          type: 'pv_cloture',
          token,
          tokenExpiresAt,
          isInPerson: false,
          initiatedById: actorId ?? null,
        },
      });
      return created.token;
    }, BON_REFERENCE_TX_OPTIONS);

    if (!claimedToken) return false;

    if (itSignatureDataUrl) {
      const user = actorId
        ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true } })
        : null;
      await this.signatureService.saveItPvSignature(bonId, itSignatureDataUrl, user?.email ?? 'unknown', actorId ?? '');
    }

    // Signatures COMPLÈTES (signatureImagePath/signerIp/signerUserAgent) pour
    // un certificat de preuve exploitable dans le PDF (correction #5).
    const fullSignatures = await this.prisma.signature.findMany({ where: { bonId } });
    const sigImages = await this.signatureService.getSignatureImagesForBon(fullSignatures);
    // L'image IT fraîchement fournie prime sur celle relue depuis le disque
    // (évite un aller-retour chiffrement/déchiffrement inutile).
    if (itSignatureDataUrl) sigImages.it = itSignatureDataUrl;

    const collabName = this.smbService.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
    const filename = `${bon.reference}_${collabName}_cloture_equipements_manquants.pdf`;
    const bonForPdf = { ...bon, signatures: fullSignatures };
    const pdfBuffer = await this.generateAndSaveSnapshot(
      bonId,
      bonForPdf,
      'cloture_equipements_manquants',
      sigImages,
      filename,
    );
    if (pdfBuffer) {
      this.smbService.exportPdf(bon, filename, pdfBuffer).catch((err) =>
        this.logger.error(`Échec export SMB [${bon.reference}]: ${(err as Error).message}`),
      );
    }

    // Le token pv_cloture est déjà créé et commité (verrou advisory ci-dessus) :
    // l'email part même si le PDF a échoué (audité séparément ci-dessus).
    this.notificationService.sendPvClotureRequest(bon, claimedToken).catch((err: unknown) =>
      this.logger.error(`Email fire-and-forget: ${err}`),
    );

    await this.prisma.auditLog.create({
      data: { bonId, userId: actorId ?? null, action: 'pv_cloture_emitted', details: { notReturnedCount } },
    });

    this.logger.log(`Bon ${bon.reference} — PV clôture émis pour co-signature`);
    return true;
  }

  /**
   * Empêche de modifier les équipements (déclarer non-rendu, marquer retrouvé)
   * pendant qu'une signature de restitution est en vol chez le collaborateur :
   * invalidateUnsignedTokens détruirait ce lien et la restitution déjà
   * effectuée par le collaborateur ne serait jamais co-signée.
   */
  private async assertNoPendingRestitutionSignature(bonId: string): Promise<void> {
    const pendingRestitutionSig = await this.prisma.signature.findFirst({
      where: { bonId, type: 'restitution', signed: false, tokenExpiresAt: { gt: new Date() } },
    });
    if (pendingRestitutionSig) {
      throw new ConflictException(
        'Une signature de restitution est en attente du collaborateur. Attendez-la ou renvoyez le lien avant de modifier les équipements.',
      );
    }
  }

  async initiateInPersonSignature(
    id: string,
    type: 'mise_disposition' | 'restitution',
    initiatedById: string,
  ) {
    const bon = await this.findOne(id);
    // Les statuts sent_* sont autorisés pour permettre de RÉAFFICHER le lien
    // présentiel (modale fermée par erreur) : la ré-initiation invalide
    // l'ancien token et en génère un nouveau — rien n'est dupliqué.
    const allowedStatuses: Record<string, string[]> = {
      mise_disposition: ['draft', 'sent_mise_dispo'],
      restitution: ['active', 'partially_returned', 'sent_restitution'],
    };

    if (!allowedStatuses[type]?.includes(bon.status)) {
      throw new BadRequestException(
        `Impossible d'initier une signature présentielle pour un bon en statut "${bon.status}"`,
      );
    }

    if (type === 'mise_disposition') {
      await this.assertSendable(bon);
    }

    if (type === 'restitution') {
      // Un PV d'équipements non restitués dû (ou déjà émis, en attente de
      // co-signature) court-circuite la restitution présentielle : les
      // équipements non rendus doivent d'abord être traités via le PV.
      const [pending, notReturnedCount, pendingPv] = await Promise.all([
        this.prisma.bonEquipment.count({ where: { bonId: id, returnedAt: null, notReturned: false } }),
        this.prisma.bonEquipment.count({ where: { bonId: id, notReturned: true } }),
        this.prisma.signature.findFirst({
          where: { bonId: id, type: 'pv_cloture', signed: false, tokenExpiresAt: { gt: new Date() } },
        }),
      ]);
      const pvDue = pending === 0 && notReturnedCount > 0;
      if (pvDue || pendingPv) {
        throw new BadRequestException(
          "Un procès-verbal d'équipements non restitués est en attente : la restitution présentielle n'est pas possible",
        );
      }
    }

    const newStatus: BonStatus = type === 'mise_disposition' ? 'sent_mise_dispo' : 'sent_restitution';
    // Ré-affichage du lien (le bon est DÉJÀ dans le statut cible) : on régénère
    // uniquement le token. On évite alors le bon.update — sinon @updatedAt
    // repositionne l'horloge à « maintenant », ce qui repousserait indéfiniment
    // les rappels et le calcul de retard (qui se basent sur updatedAt).
    const isReinit = bon.status === newStatus;

    let updated = bon;
    if (!isReinit) {
      // Marquage des équipements + transition conditionnelle dans LA MÊME
      // transaction (comme initiateRestitution) : si la transition perd la
      // course (changement de statut concurrent — annulation, contestation…),
      // le marquage des équipements ci-dessus est rollbacké avec elle, au
      // lieu de rester appliqué sur un bon dont le statut n'a pas bougé.
      await this.prisma.$transaction(async (tx) => {
        // Pour la restitution en présentiel, marquer tous les équipements non
        // encore traités comme rendus (uniquement lors de la vraie initiation)
        if (type === 'restitution') {
          await tx.bonEquipment.updateMany({
            where: { bonId: id, returnedAt: null, notReturned: false },
            data: { returnedAt: new Date() },
          });
        }
        const transition = await tx.bon.updateMany({
          where: { id, status: bon.status as BonStatus },
          data: { status: newStatus },
        });
        if (transition.count === 0) {
          throw new ConflictException('Le statut du bon a changé entre-temps — rechargez la page');
        }
      });
      updated = await this.prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

      if (bon.status === 'draft') {
        await this.prisma.auditLog.create({
          data: { bonId: id, userId: initiatedById, action: 'bon_sent', details: { inPerson: true } },
        });
      }
    }

    // Ré-affichage : renvoyer le token présentiel déjà en attente (même type,
    // non signé, non expiré) plutôt que d'en générer un nouveau à chaque
    // ouverture de la modale.
    let sig: { token: string } | null = isReinit
      ? await this.prisma.signature.findFirst({
          where: { bonId: id, type, isInPerson: true, signed: false, tokenExpiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (!sig) {
      // Invalide tous les tokens en attente, quel que soit leur type, avant
      // d'en émettre un nouveau (generateToken n'invalide que ceux du même type).
      await this.signatureService.invalidateUnsignedTokens(id);
      sig = await this.signatureService.generateToken(id, type, initiatedById, true);
    }

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
    const bons = await this.prisma.bon.findMany({
      where: {
        collaborateurId: userId,
        // Un brouillon n'a encore rien été envoyé au collaborateur — rien à
        // afficher/signer côté portail.
        status: { notIn: ['cancelled', 'draft'] },
      },
      select: {
        ...BON_SELECT.select,
        // Le portail a besoin du token du lien EN ATTENTE pour « Signer
        // maintenant ». On récupère le token de toutes les signatures puis on
        // ne CONSERVE que celui du lien réellement signable (cf. ci-dessous).
        signatures: { select: { ...SIGNATURE_SAFE_SELECT, token: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // N'exposer le token QUE sur le lien actuellement signable (non signé,
    // non it_cachet, non expiré). Les tokens des signatures déjà signées,
    // invalidées (epoch) ou du cachet IT interne sont retirés de la réponse.
    // Pour une signature présentielle (isInPerson) en attente, le token n'est
    // pas non plus exposé (elle se signe en face du technicien, pas via un
    // lien envoyé au collaborateur) : inPersonPending:true la signale à la place.
    const now = Date.now();
    return bons.map((bon) => ({
      ...bon,
      signatures: bon.signatures.map((s) => {
        const signable =
          !s.signed && s.type !== 'it_cachet' && new Date(s.tokenExpiresAt).getTime() > now;
        if (!signable) return { ...s, token: undefined };
        if (s.isInPerson) return { ...s, token: undefined, inPersonPending: true };
        return s;
      }),
    }));
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
    // (which would leave the PV unsigned and the bon stuck in partially_returned).
    // Le critère hasUnsignedPv est supprimé : une ligne Signature pv_cloture non
    // signée peut être purgée par retention.service (tokens expirés), ce qui
    // ferait alors passer un PV réellement en attente pour "pas de PV en cours".
    const notReturnedCount = bon.equipments.filter((e) => e.notReturned).length;
    const pendingReturnCount = bon.equipments.filter((e) => !e.returnedAt && !e.notReturned).length;
    const isPvClotureDue = bon.status === 'partially_returned' && pendingReturnCount === 0 && notReturnedCount > 0;
    const isPendingRestitution = bon.status === 'partially_returned' && pendingReturnCount > 0;

    if (isPvClotureDue) {
      // Si aucun PV n'a jamais été généré pour ce bon, emitPvClotureIfDue fait
      // tout (signature IT existante réutilisée, PDF, token, email) — sinon on
      // se contente de renvoyer un nouveau token pour le PV déjà émis.
      const everGenerated = await this.prisma.signature.findFirst({ where: { bonId, type: 'pv_cloture' } });
      if (!everGenerated) {
        // Pas d'invalidateUnsignedTokens ici (hors verrou) : emitPvClotureIfDue
        // invalide déjà les tokens d'un autre type DANS son verrou advisory —
        // un appel préalable pourrait, en cas de course, invalider le token
        // pv_cloture déjà committé par une requête concurrente juste avant que
        // son propre contrôle d'idempotence ne le voie.
        const emitted = await this.emitPvClotureIfDue(bonId, undefined, initiatedById);
        if (!emitted) {
          throw new BadRequestException('Impossible de générer le procès-verbal de clôture pour ce bon');
        }
      } else {
        await this.signatureService.invalidateUnsignedTokens(bonId);
        const sig = await this.signatureService.generateToken(bonId, 'pv_cloture', initiatedById, false);
        this.notificationService.sendPvClotureRequest(bon, sig.token).catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));
      }
    } else if (isPendingRestitution) {
      // Renvoyer le lien de restitution suppose qu'il en existe déjà un
      // (même expiré, mais pas invalidé à epoch) — sinon rien n'est en attente
      // de signature côté collaborateur pour ce bon.
      const pendingRestitutionSig = await this.prisma.signature.findFirst({
        where: { bonId, type: 'restitution', signed: false, tokenExpiresAt: { gt: new Date(1000) } },
        orderBy: { createdAt: 'desc' },
      });
      if (!pendingRestitutionSig) {
        throw new BadRequestException('Aucune signature en attente pour ce bon');
      }
      await this.signatureService.invalidateUnsignedTokens(bonId);
      const sig = await this.signatureService.generateToken(bonId, 'restitution', initiatedById, false);
      this.notificationService.sendRestitutionRequest(bon, sig.token).catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));
    } else {
      const type: 'mise_disposition' | 'restitution' =
        ['sent_restitution', 'partially_returned'].includes(bon.status) ? 'restitution' : 'mise_disposition';

      // Invalider le token précédent et en générer un nouveau
      await this.signatureService.invalidateUnsignedTokens(bonId);
      const sig = await this.signatureService.generateToken(bonId, type, initiatedById, false);

      // Renvoyer l'email
      if (type === 'restitution') {
        this.notificationService
          .sendRestitutionRequest(bon, sig.token)
          .catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));
      } else {
        this.notificationService
          .sendMiseDispositionRequest(bon, sig.token)
          .catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));
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

    // Transition conditionnelle ET invalidation des tokens dans LA MÊME
    // transaction interactive : les faire dans deux allers-retours séparés
    // laissait une fenêtre où sign() — qui ne bloque que cancelled/contested/
    // archived et écrit sans re-vérifier la transition attendue — pouvait
    // aboutir sur un token pas encore invalidé entre le commit de la
    // transition et l'appel à invalidateUnsignedTokens.
    const transitionWon = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.bon.updateMany({
        where: { id, status: bon.status as BonStatus },
        data: {
          status: newStatus,
          ...(newStatus === 'archived' ? { archivedAt: new Date() } : {}),
        },
      });
      if (transition.count === 0) return false;

      // Équivalent de signatureService.invalidateUnsignedTokens(id), inline
      // dans la transaction pour qu'il soit atomique avec la transition.
      await tx.signature.updateMany({
        where: { bonId: id, signed: false, tokenExpiresAt: { gt: new Date(1000) } },
        data: { tokenExpiresAt: new Date(0) },
      });
      return true;
    });
    if (!transitionWon) {
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
      // timeZone explicite : sans elle, la date affichée dépend du fuseau du
      // serveur (LOT A2, simple ajout — la logique de clôture n'est pas touchée).
      `${new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} par ${closer?.displayName ?? 'le service IT'}. Motif : ${reason}`;
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

    // Persisté via generateAndSave (ProofArchive + PdfSnapshot « courant » +
    // audit du hash, lot E) : PdfSnapshotType n'a pas de valeur dédiée à la
    // clôture unilatérale (schema.prisma hors périmètre) — on réutilise le
    // type de l'étape d'origine (signature_collab_mise_disposition /
    // signature_collab_restitution / cloture_equipements_manquants).
    // Aucune perte de preuve possible : generateAndSave écrit d'abord une
    // NOUVELLE ligne ProofArchive (append-only — un éventuel document déjà
    // présent pour ce type, ex. le brouillon de PV émis par
    // emitPvClotureIfDue, reste archivé tel quel) avant de ne mettre à jour
    // que le pointeur PdfSnapshot « courant ». Seul le type
    // signature_collab_mise_disposition est protégé en dur côté pdf.service
    // (jamais réécrit une fois réellement signé) : ce cas ne peut pas se
    // produire ici, un bon encore en sent_mise_dispo n'ayant par construction
    // jamais reçu de signature collaborateur réelle.
    const pdfBuffer = await this.generateAndSaveSnapshot(id, bonForPdf, snapshotType, sigImages, filename);
    if (pdfBuffer) {
      this.smbService.exportPdf(updated, filename, pdfBuffer).catch((err) =>
        this.logger.error(`Échec export SMB [${updated.reference}]: ${(err as Error).message}`),
      );
    }

    // Informer le collaborateur (adresse peut-être désactivée — fire & forget)
    this.notificationService.sendUnilateralCloseNotice(updated, reason, newStatus).catch((err: unknown) => this.logger.error(`Email fire-and-forget: ${err}`));

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

    return tx ? run(tx) : this.prisma.$transaction(run, BON_REFERENCE_TX_OPTIONS);
  }
}
