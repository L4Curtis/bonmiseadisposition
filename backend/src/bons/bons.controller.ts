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
  ForbiddenException,
  BadRequestException,
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
import { PdfSnapshotType } from '../common/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { isItRole } from '../common/roles';

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

    const expectedTypes = new Set<string>();
    for (const sig of signedSignatures) {
      if (sig.type === 'mise_disposition') expectedTypes.add('signature_collab_mise_disposition');
      else if (sig.type === 'restitution') expectedTypes.add('signature_collab_restitution');
      else if (sig.type === 'pv_cloture') expectedTypes.add('cloture_equipements_manquants');
      else if (sig.type === 'it_cachet') {
        // pdfType est renseigné par le flux récent (signItCachet) ; pour un
        // enregistrement plus ancien sans pdfType, on déduit depuis le statut
        // courant du bon (même heuristique que signItCachet).
        const isRestitution =
          sig.pdfType === 'restitution' ||
          (sig.pdfType == null && ['sent_restitution', 'partially_returned', 'archived'].includes(bon.status));
        expectedTypes.add(isRestitution ? 'signature_it_restitution' : 'signature_it_mise_disposition');
      }
    }

    const missing = [...expectedTypes].filter((type) => !existingTypes.has(type));
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
    // Validate enum-typed query params explicitly (a raw cast used to surface
    // as a Prisma validation error → HTTP 500 instead of 400)
    if (!['mise_disposition', 'restitution'].includes(type)) {
      throw new BadRequestException(`Type de PDF inconnu : ${type}`);
    }
    const validStages = Object.values(PdfSnapshotType) as string[];
    if (stage && !validStages.includes(stage)) {
      throw new BadRequestException(`Étape de snapshot inconnue : ${stage}`);
    }
    const bon = await this.bonsService.findOne(id);

    // If specific stage requested, serve from PdfSnapshot table
    if (stage) {
      const pdfSnapshot = await this.prisma.pdfSnapshot.findUnique({
        where: { bonId_type: { bonId: bon.id, type: stage as PdfSnapshotType } },
      });
      if (pdfSnapshot) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfSnapshot.filename}"`);
        return res.send(Buffer.from(pdfSnapshot.data));
      }
    }

    // Default: serve best available snapshot
    const snapshotType: PdfSnapshotType = type === 'restitution'
      ? 'signature_collab_restitution'
      : 'signature_collab_mise_disposition';
    const pdfSnapshot = await this.prisma.pdfSnapshot.findUnique({
      where: { bonId_type: { bonId: bon.id, type: snapshotType } },
    });

    if (pdfSnapshot) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfSnapshot.filename}"`);
      return res.send(Buffer.from(pdfSnapshot.data));
    }

    // Fallback: query legacy snapshot columns directly (not in BON_SELECT)
    const legacyBon = await this.prisma.bon.findUnique({
      where: { id: bon.id },
      select: { pdfMiseDispoSnapshot: true, pdfRestitutionSnapshot: true },
    });
    const legacySnapshot =
      type === 'restitution'
        ? legacyBon?.pdfRestitutionSnapshot
        : legacyBon?.pdfMiseDispoSnapshot;

    if (legacySnapshot) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="bon-${bon.reference}.pdf"`);
      return res.send(Buffer.from(legacySnapshot));
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
   *  décision produit 2026-06-11). */
  private async verifyCollaboratorAccess(bonId: string, user: AuthUser): Promise<void> {
    if (!user) {
      throw new ForbiddenException('Accès refusé');
    }
    if (isItRole(user.role)) return;

    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: { collaborateurId: true },
    });
    // Unknown bon: let the handler's own lookup produce its 404
    if (!bon) return;

    if (bon.collaborateurId !== user.id) {
      throw new ForbiddenException('Accès refusé à ce bon');
    }
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
