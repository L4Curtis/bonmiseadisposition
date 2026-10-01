import {
  Controller,
  Get,
  HttpCode,
  Post,
  Patch,
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
import { BonDocumentsService, BonPdfFile } from './bon-documents.service';
import { SignatureService } from '../signature/signature.service';
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
import { isItRole } from '../common/roles';
import { clientIp } from '../common/http/client-ip';
import { DeprecatedAlias } from '../common/http/deprecated-alias';
import { sendCsv } from '../common/csv/send-csv';
import type { ClientTrace } from './workflow/bon-it-signature';

/** Poste du technicien (adresse IP selon la règle unique, navigateur) :
 *  certificat de preuve des signatures IT. */
function clientTrace(req: Request): ClientTrace {
  return { ip: clientIp(req), userAgent: req.headers['user-agent'] ?? 'unknown' };
}

/** Envoie un PDF en pièce jointe. */
function sendPdf(res: Response, file: BonPdfFile): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.data);
}

/**
 * Bons : réservés à l'IT (admin, technicien), sauf les routes « propriétaire »
 * — la fiche, ses PDF, ses documents, l'intégrité — ouvertes à tout rôle
 * connecté, car chacun peut recevoir du matériel : un compte non IT n'y voit
 * que SES bons (BonDocumentsService.assertCanRead). Les bons de la personne
 * connectée sont servis par `GET /me/bons` (me.controller.ts).
 *
 * Le contrôleur ne lit pas la base : les services le font (BonsService pour le
 * cycle de vie, BonDocumentsService pour les documents et l'accès).
 */
@Controller('bons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class BonsController {
  constructor(
    private readonly bonsService: BonsService,
    private readonly documents: BonDocumentsService,
    private readonly signatureService: SignatureService,
  ) {}

  // ─── Routes statiques (avant les routes paramétrées) ───────────────────────

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

  @Get('stats')
  getStats() {
    return this.bonsService.getStats();
  }

  /** GET /bons/export — mêmes filtres et même tri que GET /bons (liste
   *  affichée), plus `ids` pour l'export d'une sélection ; page et limit sont
   *  ignorés. Coupé au plafond annoncé par la liste (`meta.exportLimit`),
   *  `X-Truncated` alors posé ; fichier daté du jour à Paris. */
  @Get('export')
  async exportCsv(@Query() dto: QueryBonsDto, @Res() res: Response) {
    const { csv, truncated } = await this.bonsService.getExportData(toBonListQuery(dto));
    sendCsv(res, { csv, filename: dto.ids?.length ? 'bons-selection' : 'bons-export', truncated });
  }

  /** GET /bons — liste paginée et filtrée, à la forme commune des listes ;
   *  `meta.exportLimit` annonce le plafond de l'export. Les « bons récents »
   *  de l'accueil en sont la première page (tri par défaut : les plus
   *  récents d'abord) : `GET /bons/recent` y mène. */
  @Get()
  @DeprecatedAlias('GET /bons/recent')
  findAll(@Query() dto: QueryBonsDto) {
    return this.bonsService.findAll({ ...toBonListQuery(dto), page: dto.page, limit: dto.limit });
  }

  @Post()
  create(@Body() dto: CreateBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.create(dto, user.id);
  }

  // ─── Fiche et lectures d'un bon ────────────────────────────────────────────

  /** GET /bons/:id — fiche : l'IT voit tout ; le collaborateur titulaire ne
   *  reçoit ni la « Note interne IT », ni le refus d'envoi, ni les actions,
   *  et un brouillon lui répond 404 comme un bon inconnu. */
  @Get(':id')
  @Roles(...ALL_ROLES)
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.documents.assertCanRead(id, user);
    return this.bonsService.detail(id, isItRole(user.role) ? 'it' : 'holder');
  }

  /** GET /bons/:id/history — qui a fait quoi, et quand (journal d'audit,
   *  phrases du catalogue), du plus ancien au plus récent. IT seulement. */
  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.bonsService.history(id);
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

  /** GET /bons/:id/integrity — vérifie les sceaux HMAC des signatures (preuve
   *  d'intégrité : détecte toute altération directe en base). 404 pour un bon
   *  inconnu. */
  @Get(':id/integrity')
  @Roles(...ALL_ROLES)
  async getIntegrity(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.documents.assertCanRead(id, user);
    return this.signatureService.verifyBonIntegrity(id);
  }

  /** GET /bons/:id/pdf-snapshots — les documents du bon, du plus ancien au
   *  plus récent (un document par signature, jamais écrasé) : tous pour l'IT,
   *  ceux qu'il peut garder pour le collaborateur. */
  @Get(':id/pdf-snapshots')
  @Roles(...ALL_ROLES)
  getPdfSnapshots(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.documents(id, user);
  }

  /** GET /bons/:id/pdf-snapshots/missing — documents attendus (une signature
   *  signée existe) mais absents, régénérables via
   *  POST /admin/pdf/regenerate-missing. */
  @Get(':id/pdf-snapshots/missing')
  getMissingPdfSnapshots(@Param('id') id: string) {
    return this.documents.missingDocuments(id);
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
    sendPdf(res, await this.documents.pdf(id, user, { type, stage, snapshot }));
  }

  /** GET /bons/:id/pdf/pv-pret — IT seulement : le PV de non-restitution
   *  déjà certifié par la signature IT mais pas encore émis (équipements
   *  encore dehors), généré à la volée, rien n'est enregistré (bons-ready-pv.ts). */
  @Get(':id/pdf/pv-pret')
  async getReadyPv(@Param('id') id: string, @Res() res: Response) {
    sendPdf(res, await this.documents.readyPv(id));
  }

  // ─── Cycle de vie ──────────────────────────────────────────────────────────

  /** PATCH /bons/:id — brouillon, ou bon envoyé pas encore signé (le lien est
   *  alors invalidé : nouvelle signature IT puis nouveau lien). */
  @Patch(':id')
  @DeprecatedAlias('PUT /bons/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.update(id, dto, user.id);
  }

  /** POST /bons/:id/cancel — annulation, motif obligatoire pour un bon envoyé.
   *  Un bon annulé n'est pas supprimé : `DELETE /bons/:id` en est l'ancienne
   *  forme (alias déprécié). */
  @Post(':id/cancel')
  @DeprecatedAlias('DELETE /bons/:id')
  cancel(@Param('id') id: string, @Body() dto: CancelBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.cancel(id, user.id, dto?.reason);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Body() dto: SendConfirmationsDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.send(id, user.id, dto ?? {});
  }

  /** POST /bons/:id/resend — IT renvoie le lien de signature
   *  (pas de @UseGuards(ThrottlerGuard) local : le guard global compte déjà
   *  la requête — l'ajouter ici double-comptait la même requête). */
  @Post(':id/resend')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resend(@Param('id') id: string, @Body() body: { force?: boolean }, @CurrentUser() user: AuthUser) {
    return this.bonsService.resendSignatureLink(id, user.id, body?.force === true);
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
