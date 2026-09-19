import {
  Controller,
  Get,
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
import { ContestationService } from '../contestation/contestation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBonDto, UpdateBonDto } from './dto/bon.dto';
import { QueryBonsDto } from './dto/query-bons.dto';
import {
  CreateContestationDto,
  InitiateRestitutionDto,
  InitiateInPersonDto,
  DeclareNotReturnedDto,
  MarkFoundDto,
  CloseUnilateralDto,
} from './dto/actions.dto';
import { SignItDto } from '../signature/dto/sign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { verifyCollaboratorAccess as verifyCollaboratorAccessImpl } from './bons-access';
import { assertValidPdfQuery, resolveBonPdf } from './bons-pdf-lookup';
import { computeMissingPdfSnapshotTypes } from './bons-missing-snapshots';

@Controller('bons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class BonsController {
  constructor(
    private readonly bonsService: BonsService,
    private readonly pdfService: PdfService,
    private readonly signatureService: SignatureService,
    private readonly contestationService: ContestationService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Routes collaborateur (override du guard global) ───────────────────────

  @Get('mes-bons')
  @Roles('admin', 'technician', 'collaborator')
  getMyBons(@CurrentUser() user: AuthUser) {
    return this.bonsService.findByCollaborateur(user.id);
  }

  /** POST /bons/:id/contestation — collaborateur conteste son bon */
  @Post(':id/contestation')
  @Roles('admin', 'technician', 'collaborator')
  async createContestation(
    @Param('id') id: string,
    @Body() dto: CreateContestationDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    return this.contestationService.create(id, user.id, dto.message);
  }

  /** POST /bons/:id/resend — IT renvoie le lien de signature
   *  (pas de @UseGuards(ThrottlerGuard) local : le guard global compte déjà
   *  la requête — l'ajouter ici double-comptait la même requête). */
  @Post(':id/resend')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resend(@Param('id') id: string, @Body() body: { force?: boolean }, @CurrentUser() user: AuthUser) {
    return this.bonsService.resendSignatureLink(id, user.id, body?.force === true);
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
    const { status, excludeStatus, filialeId, search, overdue } = dto;
    const { csv, truncated } = await this.bonsService.getExportData({
      status,
      excludeStatus,
      filialeId,
      search,
      overdue,
    });
    const filename = `bons-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (truncated) res.setHeader('X-Truncated', 'true');
    res.send(csv);
  }

  @Get()
  findAll(@Query() dto: QueryBonsDto) {
    const { status, excludeStatus, filialeId, search, overdue, page, limit } = dto;
    return this.bonsService.findAll({
      status,
      excludeStatus,
      filialeId,
      search,
      overdue,
      page: page ?? 1,
      limit: Math.min(limit ?? 20, 100),
    });
  }

  @Get(':id')
  @Roles('admin', 'technician', 'collaborator')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.findOne(id);
  }

  @Get(':id/notifications')
  async getNotifications(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.getNotificationLogs(id);
  }

  @Post()
  create(@Body() dto: CreateBonDto, @CurrentUser() user: AuthUser) {
    return this.bonsService.create(dto, user.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBonDto, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.update(id, dto);
  }

  @Delete(':id')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.cancel(id, user?.id);
  }

  @Post(':id/send')
  async send(
    @Param('id') id: string,
    @Body() body: { confirmSerialConflicts?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.send(id, user?.id, body?.confirmSerialConflicts === true);
  }

  @Post(':id/initiate-restitution')
  async initiateRestitution(
    @Param('id') id: string,
    @Body() dto: InitiateRestitutionDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.initiateRestitution(id, user?.id, dto.returnedEquipmentIds);
  }

  @Post(':id/initiate-inperson')
  async initiateInPerson(
    @Param('id') id: string,
    @Body() dto: InitiateInPersonDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.initiateInPersonSignature(id, dto.type, user.id);
  }

  @Post(':id/declare-not-returned')
  async declareNotReturned(
    @Param('id') id: string,
    @Body() dto: DeclareNotReturnedDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.declareNotReturned(id, dto.equipmentIds, dto.reason, user.id, dto.signatureDataUrl);
  }

  @Post(':id/mark-found')
  async markFound(
    @Param('id') id: string,
    @Body() dto: MarkFoundDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.markFound(id, dto.equipmentIds, user.id, dto.signatureDataUrl);
  }

  /** GET /bons/:id/integrity — vérifie les sceaux HMAC des signatures (preuve
   *  d'intégrité : détecte toute altération directe en base). */
  @Get(':id/integrity')
  @Roles('admin', 'technician', 'collaborator')
  async getIntegrity(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.signatureService.verifyBonIntegrity(id);
  }

  /** GET /bons/:id/pdf-snapshots — reste un TABLEAU (contrat existant) : le
   *  portail collaborateur (BonDetailCollaborateur.tsx) consomme cette route
   *  telle quelle (`api.get<PdfSnapshotInfo[]>`) sans gérer la forme
   *  { snapshots, missing }. Le duo BonDetail IT (useBonActions.ts) gère déjà
   *  défensivement les deux formes, mais changer la forme ici casserait le
   *  portail collaborateur — d'où l'endpoint séparé ci-dessous. */
  @Get(':id/pdf-snapshots')
  @Roles('admin', 'technician', 'collaborator')
  async getPdfSnapshots(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    const snapshots = await this.prisma.pdfSnapshot.findMany({
      where: { bonId: id },
      select: { type: true, filename: true, createdAt: true, sha256: true },
      orderBy: { createdAt: 'asc' },
    });
    return snapshots;
  }

  /** GET /bons/:id/pdf-snapshots/missing — types de snapshot attendus (une
   *  signature signée existe) mais absents de PdfSnapshot, ex. échec silencieux
   *  d'un generateAndSave passé (cf. audit pdf_snapshot_failed). Régénérable
   *  via POST /admin/pdf/regenerate-missing. */
  @Get(':id/pdf-snapshots/missing')
  @Roles('admin', 'technician', 'collaborator')
  async getMissingPdfSnapshots(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
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
  @Roles('admin', 'technician', 'collaborator')
  async getPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('type') type: 'mise_disposition' | 'restitution' = 'mise_disposition',
    @Query('stage') stage?: string,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    assertValidPdfQuery(type, stage);
    const bon = await this.bonsService.findOne(id);

    const resolved = await resolveBonPdf(this.prisma, bon, type, stage);
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
    const sigImages = await this.signatureService.getSignatureImagesForBon(fullSignatures);
    // Passer les signatures COMPLÈTES (email/IP/UA) pour que le certificat de
    // preuve soit identique à celui du snapshot stocké (même rendu, même hash).
    const pdf = await this.pdfService.generateBonPdf({ ...bon, signatures: fullSignatures }, sigImages, type);
    res.send(pdf);
  }

  /** Verify access: collaborators see only their own bons. Admins and
   *  technicians have cross-filiale access (modèle « IT centrale »,
   *  décision produit 2026-06-11). Implémentation dans bons-access.ts. */
  private async verifyCollaboratorAccess(bonId: string, user: AuthUser): Promise<void> {
    return verifyCollaboratorAccessImpl(this.prisma, bonId, user);
  }

  /** POST /bons/:id/close-unilateral — clôture sans signature du collaborateur
   *  (motif obligatoire, mention sur le PDF, traçage audit). */
  @Post(':id/close-unilateral')
  async closeUnilateral(
    @Param('id') id: string,
    @Body() dto: CloseUnilateralDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.closeUnilaterally(id, user.id, dto.reason.trim());
  }

  @Post(':id/sign-it')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async signIt(
    @Param('id') id: string,
    @Body() body: SignItDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    // Use X-Real-IP (set by nginx to $remote_addr) — cannot be spoofed by clients
    const ip =
      (req.headers['x-real-ip'] as string)?.trim() ??
      req.socket?.remoteAddress ??
      'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';
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
