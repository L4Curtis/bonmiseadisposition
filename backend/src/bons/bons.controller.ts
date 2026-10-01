import {
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { BonsService } from './bons.service';
import { PdfService } from '../pdf/pdf.service';
import { SignatureService } from '../signature/signature.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBonDto, UpdateBonDto } from './dto/bon.dto';
import { QueryBonsDto, toBonListQuery } from './dto/query-bons.dto';
import {
  InitiateRestitutionDto,
  InitiateInPersonDto,
  DeclareNotReturnedDto,
  MarkFoundDto,
  CloseUnilateralDto,
  ResendBatchDto,
  SendConfirmationsDto,
  ReasonDto,
  CancelBonDto,
  UndoReturnDto,
} from './dto/actions.dto';
import { SignItDto } from '../signature/dto/sign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, ALL_ROLES } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { verifyCollaboratorAccess as verifyCollaboratorAccessImpl } from './bons-access';
import { isItRole } from '../common/roles';
import { clientIp } from '../common/http/client-ip';
import type { ClientTrace } from './workflow/bon-it-signature';

/** Poste du technicien (adresse IP selon la règle unique, navigateur) :
 *  certificat de preuve des signatures IT. */
function clientTrace(req: Request): ClientTrace {
  return { ip: clientIp(req), userAgent: req.headers['user-agent'] ?? 'unknown' };
}
import { assertValidPdfQuery, resolveBonPdf } from './bons-pdf-lookup';
import { renderReadyPv } from './bons-ready-pv';
import { computeMissingPdfSnapshotTypes } from './bons-missing-snapshots';
import { listBonDocuments } from '../pdf/snapshot-list';
import type { DocumentAudience } from '../pdf/snapshot-audience';

/** Public des documents : l'IT voit tout l'historique, un autre compte
 *  seulement les documents qu'il peut garder. */
function documentAudience(user: AuthUser): DocumentAudience {
  return isItRole(user.role) ? 'it' : 'collaborator';
}

/**
 * Bons : réservés à l'IT (admin, technicien), sauf les routes « propriétaire »
 * — ses propres bons, leurs PDF — ouvertes à tout rôle
 * connecté, car chacun peut recevoir du matériel. Sur ces routes-là,
 * verifyCollaboratorAccess limite un compte non IT à SES bons.
 */
@Controller('bons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class BonsController {
  constructor(
    private readonly bonsService: BonsService,
    private readonly pdfService: PdfService,
    private readonly signatureService: SignatureService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Routes propriétaire (tout rôle connecté, limité à ses propres bons) ────

  @Get('mes-bons')
  @Roles(...ALL_ROLES)
  getMyBons(@CurrentUser() user: AuthUser) {
    return this.bonsService.findByCollaborateur(user.id);
  }

  /** POST /bons/:id/resend — IT renvoie le lien de signature
   *  (pas de @UseGuards(ThrottlerGuard) local : le guard global compte déjà
   *  la requête — l'ajouter ici double-comptait la même requête). */
  @Post(':id/resend')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resend(@Param('id') id: string, @Body() body: { force?: boolean }, @CurrentUser() user: AuthUser) {
    return this.bonsService.resendSignatureLink(id, user.id, body?.force === true);
  }

  /** POST /bons/resend-batch — relance groupée depuis la liste des bons (au
   *  plus MAX_RESEND_BATCH bons par appel, traités l'un après l'autre ; voir
   *  BonsService.resendSignatureLinks pour le choix d'une route groupée).
   *  Répond 200 avec un compte rendu par bon (envoyé / ignoré / en échec). */
  @Post('resend-batch')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  resendBatch(@Body() dto: ResendBatchDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.resendSignatureLinks(dto.ids, user.id, dto.force === true);
  }

  // Static routes BEFORE parameterized routes
  @Get('stats')
  getStats() {
    return this.bonsService.getStats();
  }

  @Get('recent')
  getRecent(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 10;
    const safeLimit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;
    return this.bonsService.getRecentBons(safeLimit);
  }

  @Get('export')
  async exportCsv(@Query() dto: QueryBonsDto, @Res() res: Response) {
    // Mêmes filtres et même tri que GET /bons (liste affichée), plus `ids`
    // pour l'export d'une sélection ; page/limit sont ignorés ici.
    const { csv, truncated } = await this.bonsService.getExportData(toBonListQuery(dto));
    const filename = `bons-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (truncated) res.setHeader('X-Truncated', 'true');
    res.send(csv);
  }

  @Get()
  findAll(@Query() dto: QueryBonsDto) {
    return this.bonsService.findAll({
      ...toBonListQuery(dto),
      page: dto.page ?? 1,
      limit: Math.min(dto.limit ?? 20, 100),
    });
  }

  /** GET /bons/:id — fiche : l'IT voit tout ; le collaborateur titulaire ne
   *  reçoit ni la « Note interne IT », ni le refus d'envoi, ni les actions,
   *  et un brouillon lui répond 404 comme un bon inconnu. */
  @Get(':id')
  @Roles(...ALL_ROLES)
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.detail(id, isItRole(user.role) ? 'it' : 'holder');
  }

  /** GET /bons/:id/send-check — contrôles avant la remise (R-003), à montrer
   *  avant la signature IT. */
  @Get(':id/send-check')
  sendCheck(@Param('id') id: string) {
    return this.bonsService.sendChecks(id);
  }

  @Get(':id/notifications')
  getNotifications(@Param('id') id: string) {
    return this.bonsService.getNotificationLogs(id);
  }

  @Post()
  create(@Body() dto: CreateBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.create(dto, user.id);
  }

  /** PUT /bons/:id — brouillon, ou bon envoyé pas encore signé (le lien est
   *  alors invalidé : nouvelle signature IT puis nouveau lien). */
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.update(id, dto, user.id);
  }

  /** POST /bons/:id/cancel — annulation, motif obligatoire pour un bon envoyé. */
  @Post(':id/cancel')
  cancelWithReason(@Param('id') id: string, @Body() dto: CancelBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.cancel(id, user.id, dto.reason);
  }

  /** DELETE /bons/:id — ancienne forme de l'annulation (motif dans le corps). */
  @Delete(':id')
  cancel(@Param('id') id: string, @Body() dto: CancelBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.cancel(id, user.id, dto?.reason);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Body() dto: SendConfirmationsDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.send(id, user.id, dto ?? {});
  }

  /** POST /bons/:id/initiate-restitution — marque les équipements rendus
   *  (aucun lien ne part : signature IT d'abord). */
  @Post(':id/initiate-restitution')
  initiateRestitution(
    @Param('id') id: string,
    @Body() dto: InitiateRestitutionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bonsService.initiateRestitution(id, user.id, dto.returnedEquipmentIds, dto.inPerson === true, dto.undoEquipmentIds);
  }

  /** POST /bons/:id/undo-return — annule le marquage « rendu » avant signature. */
  @Post(':id/undo-return')
  undoReturn(@Param('id') id: string, @Body() dto: UndoReturnDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.undoReturn(id, user.id, dto.equipmentIds);
  }

  @Post(':id/initiate-inperson')
  initiateInPerson(
    @Param('id') id: string,
    @Body() dto: InitiateInPersonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const { type, confirmSerialConflicts, confirmMissingSerials } = dto;
    return this.bonsService.initiateInPersonSignature(id, type, user.id, { confirmSerialConflicts, confirmMissingSerials });
  }

  /** POST /bons/:id/handover-without-signature — « Constater la remise sans signature ». */
  @Post(':id/handover-without-signature')
  handoverWithoutSignature(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.handoverWithoutSignature(id, user.id, dto.reason);
  }

  /** POST /bons/:id/close-without-signature — « Clôturer sans signature ». */
  @Post(':id/close-without-signature')
  closeWithoutSignature(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.closeWithoutSignature(id, user.id, dto.reason);
  }

  @Post(':id/declare-not-returned')
  declareNotReturned(
    @Param('id') id: string,
    @Body() dto: DeclareNotReturnedDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.bonsService.declareNotReturned(
      id, dto.equipmentIds, dto.reason, user.id, dto.signatureDataUrl, clientTrace(req),
    );
  }

  @Post(':id/mark-found')
  markFound(
    @Param('id') id: string,
    @Body() dto: MarkFoundDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.bonsService.markFound(id, dto.equipmentIds, user.id, dto.signatureDataUrl, clientTrace(req));
  }

  /** GET /bons/:id/integrity — vérifie les sceaux HMAC des signatures (preuve
   *  d'intégrité : détecte toute altération directe en base). */
  @Get(':id/integrity')
  @Roles(...ALL_ROLES)
  async getIntegrity(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.signatureService.verifyBonIntegrity(id);
  }

  /** GET /bons/:id/pdf-snapshots — les documents du bon, du plus ancien au
   *  plus récent (un document par signature, jamais écrasé), en tableau nu lu
   *  tel quel par la fiche IT (tous) et le portail (ceux que le collaborateur
   *  peut garder). Les documents manquants ont leur route séparée ci-dessous. */
  @Get(':id/pdf-snapshots')
  @Roles(...ALL_ROLES)
  async getPdfSnapshots(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return listBonDocuments(this.prisma, id, documentAudience(user));
  }

  /** GET /bons/:id/pdf-snapshots/missing — types de snapshot attendus (une
   *  signature signée existe) mais absents de PdfSnapshot, ex. échec silencieux
   *  d'un generateAndSave passé (cf. audit pdf_snapshot_failed). Régénérable
   *  via POST /admin/pdf/regenerate-missing. */
  @Get(':id/pdf-snapshots/missing')
  async getMissingPdfSnapshots(@Param('id') id: string) {
    const bon = await this.bonsService.findOne(id);
    const [signedSignatures, existingSnapshots] = await Promise.all([
      this.prisma.signature.findMany({ where: { bonId: id, signed: true }, select: { type: true, pdfType: true } }),
      this.prisma.pdfSnapshot.findMany({ where: { bonId: id }, select: { type: true } }),
    ]);
    const existingTypes = new Set(existingSnapshots.map((s) => s.type as string));
    const missing = computeMissingPdfSnapshotTypes(signedSignatures, existingTypes, bon.status);
    return { missing };
  }

  @Get(':id/pdf')
  @Roles(...ALL_ROLES)
  async getPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('type') type: 'mise_disposition' | 'restitution' = 'mise_disposition',
    @Query('stage') stage?: string,
    @Query('snapshot') snapshot?: string,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    assertValidPdfQuery(type, stage, snapshot);
    const bon = await this.bonsService.findOne(id);

    const resolved = await resolveBonPdf(this.prisma, bon, type, stage, snapshot, documentAudience(user));
    if (resolved) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${resolved.filename}"`);
      return res.send(resolved.data);
    }

    // Generate on-the-fly. BON_SELECT no longer exposes signatureImagePath, so
    // fetch the full signature records here (internal use only).
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bon-${bon.reference}.pdf"`);
    const fullSignatures = await this.prisma.signature.findMany({ where: { bonId: bon.id } });
    // Passer les signatures COMPLÈTES (email/IP/UA) pour que le certificat de
    // preuve soit identique à celui du snapshot stocké (même rendu, même hash).
    const pdf = await this.pdfService.generateBonPdf({ ...bon, signatures: fullSignatures }, null, type);
    res.send(pdf);
  }

  /** GET /bons/:id/pdf/pv-pret — IT seulement : le PV de non-restitution
   *  déjà certifié par la signature IT mais pas encore émis (équipements
   *  encore dehors), généré à la volée, rien n'est enregistré (bons-ready-pv.ts). */
  @Get(':id/pdf/pv-pret')
  async getReadyPv(@Param('id') id: string, @Res() res: Response) {
    const bon = await this.bonsService.findOne(id);
    const { filename, data } = await renderReadyPv({ prisma: this.prisma, pdfService: this.pdfService }, bon);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(data);
  }

  /** Routes propriétaire : un compte non IT ne voit que ses propres bons ;
   *  admins et techniciens ont un accès transverse (modèle « IT centrale »,
   *  décision produit 2026-06-11). Implémentation dans bons-access.ts.
   *  Inutile sur les routes réservées à l'IT, où elle ne vérifierait rien. */
  private async verifyCollaboratorAccess(bonId: string, user: AuthUser): Promise<void> {
    return verifyCollaboratorAccessImpl(this.prisma, bonId, user);
  }

  /** POST /bons/:id/close-unilateral — ancien nom des deux gestes sans
   *  signature, gardé pour compatibilité : « Constater la remise » depuis
   *  « Remise à signer », « Clôturer » sinon. */
  @Post(':id/close-unilateral')
  closeUnilateral(
    @Param('id') id: string,
    @Body() dto: CloseUnilateralDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bonsService.closeUnilaterally(id, user.id, dto.reason.trim());
  }

  @Post(':id/sign-it')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  signIt(
    @Param('id') id: string,
    @Body() body: SignItDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const { ip, userAgent } = clientTrace(req);
    return this.signatureService.signItCachet(
      id,
      body.signatureDataUrl,
      user.email,
      ip,
      userAgent,
      body.pdfType,
    );
  }
}
