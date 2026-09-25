import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBonDto, UpdateBonDto } from './dto/bon.dto';
import { SignatureService } from '../signature/signature.service';
import { NotificationService } from '../notification/notification.service';
import { PdfService } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { AppConfigService } from '../config/config.service';
import { SIGNATURE_SAFE_SELECT } from '../common/types';

import { BON_SELECT, buildBonWhere, findBonOrThrow, BonListFilters } from './queries/bon-where';
import { getBonStats } from './queries/bon-stats';
import { BON_LIST_SELECT } from './queries/bon-list-select';
import { buildBonOrderBy, BonSortField, SortOrder } from './queries/bon-order';
import { getExportData as buildExportData } from './export/bon-csv';
import { mapCollaborateurBons } from './bon-mappers';
import { BonsWorkflowContext } from './workflow/bon-context';
import * as bonCrud from './workflow/bon-crud';
import * as bonSend from './workflow/bon-send';
import * as bonRestitution from './workflow/bon-restitution';
import { markFound as markFoundWorkflow } from './workflow/bon-mark-found';
import * as bonCloture from './workflow/bon-cloture';
import { resendSignatureLink as resendSignatureLinkWorkflow } from './workflow/bon-resend';
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
 * Façade du domaine « bons » : conserve le nom de classe / constructeur /
 * méthodes publiques attendus par bons.module.ts (jeton BONS_SERVICE) et par
 * SignatureService (résolution via ModuleRef — voir bons.tokens.ts). Le
 * détail des requêtes, de l'export CSV, des validations et des étapes du
 * cycle de vie (envoi, restitution, PV de clôture, clôture unilatérale…) vit
 * dans les modules purs sous `bons/queries`, `bons/export`, `bons/validation`
 * et `bons/workflow`, qui reçoivent un contexte explicite plutôt qu'un accès
 * implicite via `this`.
 */
@Injectable()
export class BonsService {
  private readonly logger = new Logger(BonsService.name);
  private readonly ctx: BonsWorkflowContext;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureService: SignatureService,
    private readonly notificationService: NotificationService,
    private readonly pdfService: PdfService,
    private readonly smbService: SmbService,
    private readonly configService: AppConfigService,
  ) {
    this.ctx = {
      prisma: this.prisma,
      signatureService: this.signatureService,
      notificationService: this.notificationService,
      pdfService: this.pdfService,
      smbService: this.smbService,
      configService: this.configService,
      logger: this.logger,
    };
  }

  async getNotificationLogs(bonId: string) {
    await this.findOne(bonId); // throws 404 if not found
    return this.prisma.notificationLog.findMany({
      where: { bonId },
      orderBy: { sentAt: 'desc' },
    });
  }

  async getStats() {
    const overdueThresholdDays = await this.configService.getSignatureOverdueDays();
    return getBonStats(this.prisma, overdueThresholdDays);
  }

  getExportData(
    filters: BonListFilters & { sort?: BonSortField; order?: SortOrder },
  ): Promise<{ csv: string; truncated: boolean }> {
    return buildExportData(this.prisma, this.configService, filters);
  }

  /** Liste paginée. Projection allégée (BON_LIST_SELECT, pas BON_SELECT : la
   *  fiche complète reste sur GET /bons/:id) et tri stable (départage par id,
   *  voir buildBonOrderBy). */
  async findAll(
    filters: BonListFilters & { page?: number; limit?: number; sort?: BonSortField; order?: SortOrder },
  ) {
    const { page = 1, limit = 20 } = filters;
    const overdueThresholdDays = await this.configService.getSignatureOverdueDays();
    const where = buildBonWhere(filters, overdueThresholdDays);

    const [bons, total] = await Promise.all([
      this.prisma.bon.findMany({
        where,
        select: BON_LIST_SELECT,
        orderBy: buildBonOrderBy(filters.sort, filters.order),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bon.count({ where }),
    ]);

    return { bons, total, page, limit };
  }

  findOne(id: string) {
    return findBonOrThrow(this.prisma, id);
  }

  create(dto: CreateBonDto, userId: string) {
    return bonCrud.createBon(this.ctx, dto, userId);
  }

  update(id: string, dto: UpdateBonDto) {
    return bonCrud.updateBon(this.ctx, id, dto);
  }

  cancel(id: string, userId?: string) {
    return bonCrud.cancelBon(this.ctx, id, userId);
  }

  send(id: string, initiatedById?: string, confirmSerialConflicts = false) {
    return bonSend.sendBon(this.ctx, id, initiatedById, confirmSerialConflicts);
  }

  initiateRestitution(id: string, initiatedById?: string, returnedEquipmentIds?: string[]) {
    return bonRestitution.initiateRestitution(this.ctx, id, initiatedById, returnedEquipmentIds);
  }

  declareNotReturned(id: string, equipmentIds: string[], reason: string, userId: string, signatureDataUrl?: string) {
    return bonRestitution.declareNotReturned(this.ctx, id, equipmentIds, reason, userId, signatureDataUrl);
  }

  markFound(id: string, equipmentIds: string[], userId: string, signatureDataUrl?: string) {
    return markFoundWorkflow(this.ctx, id, equipmentIds, userId, signatureDataUrl);
  }

  /**
   * Émet le procès-verbal de clôture (équipements non rendus) si — et
   * seulement si — le bon est réellement dans cet état. Contrat public
   * réutilisé par declareNotReturned/markFound (bons/workflow) et par
   * signature.service après une signature de restitution (LOT B, via
   * ModuleRef) : NE PAS renommer / changer la signature sans coordination.
   * Détail de l'implémentation dans `bons/workflow/bon-cloture.ts`.
   */
  emitPvClotureIfDue(bonId: string, itSignatureDataUrl?: string, actorId?: string): Promise<boolean> {
    return bonCloture.emitPvClotureIfDue(this.ctx, bonId, itSignatureDataUrl, actorId);
  }

  initiateInPersonSignature(id: string, type: 'mise_disposition' | 'restitution', initiatedById: string) {
    return bonSend.initiateInPersonSignature(this.ctx, id, type, initiatedById);
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
        status: { notIn: [...COLLAB_HIDDEN_BON_STATUSES] },
      },
      select: {
        ...BON_SELECT.select,
        // Le portail a besoin du token du lien EN ATTENTE pour « Signer
        // maintenant ». On récupère le token de toutes les signatures puis on
        // ne CONSERVE que celui du lien réellement signable (bon-mappers).
        signatures: { select: { ...SIGNATURE_SAFE_SELECT, token: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return mapCollaborateurBons(bons);
  }

  resendSignatureLink(bonId: string, initiatedById: string, force = false) {
    return resendSignatureLinkWorkflow(this.ctx, bonId, initiatedById, force);
  }

  /**
   * Relance groupée des liens de signature (liste des bons, sélection
   * multiple). Chaque bon passe par exactement le même chemin que le bouton
   * « Renvoyer le lien » de la fiche (resendSignatureLinkWorkflow : mêmes
   * contrôles, même email, même ligne d'audit), l'un après l'autre — jamais en
   * parallèle, pour ne pas envoyer une rafale d'emails ni saturer la base.
   *
   * Pourquoi une route groupée plutôt que N appels à POST /bons/:id/resend :
   * celle-ci est limitée à 5 appels par minute (anti-spam d'un même lien), ce
   * qui rendrait une relance de 20 bons impossible depuis le navigateur sans
   * attendre plusieurs minutes. Un refus métier (lien envoyé il y a moins
   * d'une heure sans `force`, bon plus en attente, collaborateur sans
   * adresse…) n'interrompt pas le lot : le bon est compté « ignoré » avec son
   * motif ; une erreur imprévue le compte « en échec » et est journalisée.
   */
  async resendSignatureLinks(ids: readonly string[], initiatedById: string, force = false): Promise<ResendBatchResult> {
    const uniqueIds = [...new Set(ids)];
    const results: ResendBatchItem[] = [];
    for (const id of uniqueIds) {
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
          return {
            id,
            outcome: 'skipped',
            code: 'token_recent',
            reason: 'Un lien a été envoyé il y a moins d’une heure',
            sentAt: body.sentAt,
          };
        }
      }
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        return { id, outcome: 'skipped', reason: err.message };
      }
      this.logger.error(
        `Relance groupée : échec du renvoi pour le bon ${id} — ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
      );
      return { id, outcome: 'failed', reason: 'Erreur inattendue lors du renvoi' };
    }
  }

  closeUnilaterally(id: string, userId: string, reason: string) {
    return bonCloture.closeUnilaterally(this.ctx, id, userId, reason);
  }

  duplicateAsDraft(
    sourceBonId: string,
    userId: string,
    context?: { contestationId?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return bonCrud.duplicateAsDraft(this.ctx, sourceBonId, userId, context, tx);
  }
}
