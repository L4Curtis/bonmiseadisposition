import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BonStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBonDto, UpdateBonDto } from './dto/bon.dto';
import { SignatureService } from '../signature/signature.service';
import { NotificationService } from '../notification/notification.service';
import { PdfService } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { AppConfigService } from '../config/config.service';
import { DomainEventsPublisher, SignatureSignedEvent } from '../common/events';

import { BON_SELECT, buildBonWhere, findBonDetailOrThrow, findBonOrThrow, BonListFilters } from './queries/bon-where';
import { getBonStats } from './queries/bon-stats';
import { BON_LIST_SELECT } from './queries/bon-list-select';
import { findBonIdsBySubStatus, intersectIds } from './queries/bon-substatus-filter';
import { buildBonOrderBy, BonSortField, SortOrder } from './queries/bon-order';
import { getExportData as buildExportData } from './export/bon-csv';
import { mapCollaborateurBons } from './bon-mappers';
import { BON_DETAIL_SELECT, BON_SIGNATURE_SELECT, BonViewer, presentBonDetail } from './bon-view';
import { loadBonItNotices } from './bon-it-notices';
import { loadSignatureSignerNames, withSignerNames } from './bon-signer-names';
import { attachNewLinkRequests } from '../signature/link-request';
import { presentBonListItem } from './bon-list-view';
import { BonsWorkflowContext } from './workflow/bon-context';
import * as bonCrud from './workflow/bon-crud';
import { updateBon } from './workflow/bon-update';
import { cancelBon } from './workflow/bon-cancel';
import * as bonSend from './workflow/bon-send';
import * as bonRestitution from './workflow/bon-restitution';
import { markFound as markFoundWorkflow } from './workflow/bon-mark-found';
import * as withoutSignature from './workflow/bon-without-signature';
import { resendSignatureLink as resendSignatureLinkWorkflow } from './workflow/bon-resend';
import { computeSendChecks, SendConfirmations } from './workflow/bon-send-checks';
import { closeReplacedOriginal, createReplacementBon } from './workflow/bon-replacement';
import { CorrectableDocument, reopenForCorrection } from './workflow/bon-reopen';
import type { ClientTrace } from './workflow/bon-it-signature';
import { afterCollaboratorSignature } from './workflow/bon-after-signature';
import { COLLAB_HIDDEN_BON_STATUSES } from './bon-status';

/** Compte rendu d'un bon dans une relance groupée. */
export interface ResendBatchItem {
  id: string;
  outcome: 'sent' | 'skipped' | 'failed';
  /** Motif lisible d'un bon ignoré ou en échec. */
  reason?: string;
  /** `token_recent` : lien envoyé il y a moins d'une heure (relançable avec force). */
  code?: 'token_recent';
  /** Date d'envoi du lien récent (code `token_recent`). */
  sentAt?: string;
}

export interface ResendBatchResult {
  results: ResendBatchItem[];
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Façade du domaine « bons ». Les étapes du cycle de vie vivent dans
 * `bons/workflow/*` (fonctions qui reçoivent un contexte explicite) et
 * passent toutes par la machine à états (`workflow/state-machine.ts`) ; les
 * réponses sont mises en forme par `bon-view.ts` (fiche) et
 * `bon-list-view.ts` (liste), qui y ajoutent l'état calculé.
 *
 * Chaque action renvoie la fiche À JOUR, vue par l'équipe informatique.
 */
@Injectable()
export class BonsService {
  private readonly logger = new Logger(BonsService.name);
  private readonly ctx: BonsWorkflowContext;

  constructor(
    private readonly prisma: PrismaService,
    signatureService: SignatureService,
    notificationService: NotificationService,
    pdfService: PdfService,
    smbService: SmbService,
    private readonly configService: AppConfigService,
    events: DomainEventsPublisher,
  ) {
    this.ctx = {
      prisma,
      signatureService,
      notificationService,
      pdfService,
      smbService,
      configService,
      events,
      logger: this.logger,
    };
  }

  // ─── Lectures ──────────────────────────────────────────────────────────────

  async getNotificationLogs(bonId: string) {
    await findBonOrThrow(this.prisma, bonId);
    return this.prisma.notificationLog.findMany({ where: { bonId }, orderBy: { sentAt: 'desc' } });
  }

  async getStats() {
    const overdueThresholdDays = await this.configService.getSignatureOverdueDays();
    return getBonStats(this.prisma, overdueThresholdDays);
  }

  async getExportData(filters: BonListFilters & { sort?: BonSortField; order?: SortOrder }) {
    return buildExportData(this.prisma, this.configService, await this.resolveSubStatus(filters));
  }

  /** Filtre de sous-état : traduit en identifiants par la règle de la fiche. */
  private async resolveSubStatus<F extends BonListFilters>(filters: F): Promise<F> {
    if (!filters.subStatus) return filters;
    const found = await findBonIdsBySubStatus(this.prisma, filters.subStatus);
    return { ...filters, restrictToIds: intersectIds(filters.ids, found) };
  }

  /** Liste paginée : projection allégée, tri stable (départage par id), et
   *  pour chaque ligne l'état calculé par la machine à états. */
  async findAll(filters: BonListFilters & { page?: number; limit?: number; sort?: BonSortField; order?: SortOrder }) {
    const { page = 1, limit = 20 } = filters;
    const overdueDays = await this.configService.getSignatureOverdueDays();
    const where = buildBonWhere(await this.resolveSubStatus(filters), overdueDays);
    const [rows, total] = await Promise.all([
      this.prisma.bon.findMany({
        where,
        select: BON_LIST_SELECT,
        orderBy: buildBonOrderBy(filters.sort, filters.order),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bon.count({ where }),
    ]);
    const now = new Date();
    return { bons: rows.map((row) => presentBonListItem(row, overdueDays, now)), total, page, limit };
  }

  /** Fiche d'un bon, pour l'IT ou pour le collaborateur titulaire (sans les
   *  champs réservés à l'IT). */
  async detail(id: string, viewer: BonViewer = 'it') {
    const [bon, signatureOverdueDays] = await Promise.all([
      findBonDetailOrThrow(this.prisma, id),
      this.configService.getSignatureOverdueDays(),
    ]);
    if (viewer === 'holder') {
      const [view] = await attachNewLinkRequests(this.prisma, [presentBonDetail(bon, { viewer, signatureOverdueDays })]);
      return view;
    }
    const [notices, signerNames] = await Promise.all([
      loadBonItNotices(this.prisma, bon),
      loadSignatureSignerNames(this.prisma, bon.signatures),
    ]);
    const [view] = await attachNewLinkRequests(this.prisma, [presentBonDetail(bon, { viewer, signatureOverdueDays, notices })]);
    return withSignerNames(view, signerNames);
  }

  /** Bon brut (select canonique), pour le rendu PDF à la demande. */
  findOne(id: string) {
    return findBonOrThrow(this.prisma, id);
  }

  async getRecentBons(limit = 10) {
    const [rows, signatureOverdueDays] = await Promise.all([
      this.prisma.bon.findMany({ ...BON_DETAIL_SELECT, orderBy: { createdAt: 'desc' }, take: limit }),
      this.configService.getSignatureOverdueDays(),
    ]);
    return rows.map((bon) => presentBonDetail(bon, { viewer: 'it', signatureOverdueDays }));
  }

  /**
   * « Mes équipements » : bons du collaborateur (hors brouillons et annulés),
   * vus comme par le titulaire — état calculé compris (sous-état, document
   * en attente, remplacement, état de chaque équipement) — avec les seuls
   * jetons utiles au portail (voir mapCollaborateurBons).
   */
  async findByCollaborateur(userId: string) {
    const [rows, signatureOverdueDays] = await Promise.all([
      this.prisma.bon.findMany({
        where: { collaborateurId: userId, status: { notIn: [...COLLAB_HIDDEN_BON_STATUSES] } },
        select: {
          ...BON_DETAIL_SELECT.select,
          signatures: { select: { ...BON_SIGNATURE_SELECT, token: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.configService.getSignatureOverdueDays(),
    ]);
    const now = new Date();
    const views = rows.map((bon) => presentBonDetail(bon, { viewer: 'holder', signatureOverdueDays, now }));
    return mapCollaborateurBons(await attachNewLinkRequests(this.prisma, views));
  }

  /** Contrôles avant la remise (lignes sans numéro, séries en circulation). */
  async sendChecks(id: string) {
    const bon = await findBonDetailOrThrow(this.prisma, id);
    return computeSendChecks(this.prisma, bon);
  }

  // ─── Actions du cycle de vie ───────────────────────────────────────────────

  async create(dto: CreateBonDto, userId: string) {
    return this.detail(await bonCrud.createBon(this.ctx, dto, userId));
  }

  async update(id: string, dto: UpdateBonDto, actorId: string | null) {
    await updateBon(this.ctx, id, dto, actorId);
    return this.detail(id);
  }

  async cancel(id: string, actorId: string | null, reason?: string) {
    await cancelBon(this.ctx, id, actorId, reason);
    return this.detail(id);
  }

  async send(id: string, actorId: string | null, confirmations: SendConfirmations = {}) {
    await bonSend.sendBon(this.ctx, id, actorId, confirmations);
    return this.detail(id);
  }

  async initiateInPersonSignature(
    id: string,
    type: bonSend.InPersonDocument,
    actorId: string,
    confirmations: SendConfirmations = {},
  ) {
    const token = await bonSend.initiateInPersonSignature(this.ctx, id, type, actorId, confirmations);
    return { bon: await this.detail(id), token };
  }

  async initiateRestitution(
    id: string,
    actorId: string | null,
    returnedEquipmentIds?: string[],
    inPerson = false,
    undoEquipmentIds: string[] = [],
  ) {
    await bonRestitution.initiateRestitution(this.ctx, id, actorId, returnedEquipmentIds, inPerson, undoEquipmentIds);
    return this.detail(id);
  }

  async undoReturn(id: string, actorId: string, equipmentIds: string[]) {
    await bonRestitution.undoReturn(this.ctx, id, actorId, equipmentIds);
    return this.detail(id);
  }

  async declareNotReturned(
    id: string,
    equipmentIds: string[],
    reason: string,
    userId: string,
    signatureDataUrl?: string,
    client?: ClientTrace,
  ) {
    await bonRestitution.declareNotReturned(this.ctx, id, equipmentIds, reason, userId, signatureDataUrl, client);
    return this.detail(id);
  }

  async markFound(id: string, equipmentIds: string[], userId: string, signatureDataUrl?: string, client?: ClientTrace) {
    await markFoundWorkflow(this.ctx, id, equipmentIds, userId, signatureDataUrl, client);
    return this.detail(id);
  }

  async handoverWithoutSignature(id: string, actorId: string, reason: string) {
    await withoutSignature.handoverWithoutSignature(this.ctx, id, actorId, reason);
    return this.detail(id);
  }

  async closeWithoutSignature(id: string, actorId: string, reason: string) {
    await withoutSignature.closeWithoutSignature(this.ctx, id, actorId, reason);
    return this.detail(id);
  }

  /** Ancienne route « clôture unilatérale » : l'un ou l'autre geste selon le statut. */
  async closeUnilaterally(id: string, actorId: string, reason: string) {
    await withoutSignature.closeUnilaterally(this.ctx, id, actorId, reason);
    return this.detail(id);
  }

  resendSignatureLink(bonId: string, initiatedById: string, force = false) {
    return resendSignatureLinkWorkflow(this.ctx, bonId, initiatedById, force);
  }

  /**
   * Relance groupée des liens (liste des bons) : chaque bon suit exactement
   * le chemin du bouton « Renvoyer » de la fiche, l'un après l'autre, jamais en
   * parallèle. Un refus métier (lien récent sans `force`, rien à signer,
   * compte sans adresse…) n'interrompt pas le lot : le bon est « ignoré » avec
   * son motif ; une erreur imprévue le compte « en échec » et est journalisée.
   */
  async resendSignatureLinks(ids: readonly string[], initiatedById: string, force = false): Promise<ResendBatchResult> {
    const results: ResendBatchItem[] = [];
    for (const id of [...new Set(ids)]) {
      results.push(await this.resendOne(id, initiatedById, force));
    }
    return {
      results,
      sent: results.filter((r) => r.outcome === 'sent').length,
      skipped: results.filter((r) => r.outcome === 'skipped').length,
      failed: results.filter((r) => r.outcome === 'failed').length,
    };
  }

  private async resendOne(id: string, initiatedById: string, force: boolean): Promise<ResendBatchItem> {
    try {
      await resendSignatureLinkWorkflow(this.ctx, id, initiatedById, force);
      return { id, outcome: 'sent' };
    } catch (err: unknown) {
      if (err instanceof ConflictException) {
        const body = err.getResponse() as { code?: string; sentAt?: string };
        if (body?.code === 'token_recent') {
          return { id, outcome: 'skipped', code: 'token_recent', reason: 'Un lien a été envoyé il y a moins d’une heure', sentAt: body.sentAt };
        }
      }
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        return { id, outcome: 'skipped', reason: err.message };
      }
      this.logger.error(`Relance groupée : échec du renvoi pour le bon ${id} — ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      return { id, outcome: 'failed', reason: 'Erreur inattendue lors du renvoi' };
    }
  }

  // ─── Remplacement et suites de signature ───────────────────────────────────

  /**
   * Bon remplaçant d'une contestation Fondée (port `ReplacementBonCreator` du
   * module Contestation) : brouillon lié à l'original, créé dans la
   * transaction de la décision. Voir workflow/bon-replacement.ts.
   */
  async createReplacementBon(
    tx: Prisma.TransactionClient,
    originalBonId: string,
    contestationId: string,
    actorId: string,
  ): Promise<{ id: string; reference: string; status: BonStatus }> {
    const created = await createReplacementBon(this.ctx, { originalBonId, actorId, contestationId }, tx);
    return { ...created, status: 'draft' };
  }

  /**
   * Contestation Fondée sur une restitution ou un PV : correction du bon
   * d'origine (voir workflow/bon-reopen.ts). À appeler dans la transaction de
   * la décision, une fois le bon revenu à son statut d'avant la contestation.
   */
  reopenForCorrection(
    bonId: string,
    contestedDocument: CorrectableDocument,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    return reopenForCorrection(this.ctx, bonId, contestedDocument, actorId, tx);
  }

  /** Remise du remplaçant constatée sans signature : l'original est aussi clôturé. */
  closeReplacedOriginal(replacementBonId: string): Promise<void> {
    return closeReplacedOriginal(this.ctx, replacementBonId);
  }

  /** Duplique un bon en brouillon (ancien parcours de correction). */
  duplicateAsDraft(sourceBonId: string, userId: string, context?: { contestationId?: string }, tx?: Prisma.TransactionClient) {
    return bonCrud.duplicateAsDraft(this.ctx, sourceBonId, userId, context, tx);
  }

  /** Suites d'une signature du collaborateur (écouteur de `signature.signed`). */
  afterCollaboratorSignature(event: SignatureSignedEvent): Promise<void> {
    return afterCollaboratorSignature(this.ctx, event);
  }
}
