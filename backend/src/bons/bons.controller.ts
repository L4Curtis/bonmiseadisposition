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
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
} from './dto/actions.dto';
import { SignItDto } from '../signature/dto/sign.dto';
import { PdfSnapshotType } from '../common/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

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

  /** POST /bons/:id/resend — IT renvoie le lien de signature */
  @Post(':id/resend')
  @UseGuards(ThrottlerGuard)
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
    return this.bonsService.getRecentBons(Math.min(limit ? parseInt(limit) : 10, 50));
  }

  @Get('export')
  async exportCsv(
    @Query() dto: QueryBonsDto,
    @Res() res?: Response,
  ) {
    const { status, filialeId, search } = dto;
    const csv = await this.bonsService.getExportData({ status, filialeId, search });
    const filename = `bons-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res!.send(csv);
  }

  @Get()
  findAll(@Query() dto: QueryBonsDto) {
    const { status, filialeId, search, page, limit } = dto;
    return this.bonsService.findAll({
      status,
      filialeId,
      search,
      page: page ? parseInt(page) : 1,
      limit: Math.min(limit ? parseInt(limit) : 20, 100),
    });
  }

  @Get(':id')
  @Roles('admin', 'technician', 'collaborator')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.findOne(id);
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
  async send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    return this.bonsService.send(id, user?.id);
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

  @Get(':id/pdf-snapshots')
  @Roles('admin', 'technician', 'collaborator')
  async getPdfSnapshots(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.verifyCollaboratorAccess(id, user);
    const snapshots = await this.prisma.pdfSnapshot.findMany({
      where: { bonId: id },
      select: { type: true, filename: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return snapshots;
  }

  @Get(':id/pdf')
  @Roles('admin', 'technician', 'collaborator')
  async getPdf(
    @Param('id') id: string,
    @Query('type') type: 'mise_disposition' | 'restitution' = 'mise_disposition',
    @Query('stage') stage?: string,
    @Res() res?: Response,
    @CurrentUser() user?: AuthUser,
  ) {
    await this.verifyCollaboratorAccess(id, user);
    const bon = await this.bonsService.findOne(id);

    // If specific stage requested, serve from PdfSnapshot table
    if (stage) {
      const pdfSnapshot = await this.prisma.pdfSnapshot.findUnique({
        where: { bonId_type: { bonId: bon.id, type: stage as PdfSnapshotType } },
      });
      if (pdfSnapshot) {
        res!.setHeader('Content-Type', 'application/pdf');
        res!.setHeader('Content-Disposition', `attachment; filename="${pdfSnapshot.filename}"`);
        return res!.send(Buffer.from(pdfSnapshot.data));
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
      res!.setHeader('Content-Type', 'application/pdf');
      res!.setHeader('Content-Disposition', `attachment; filename="${pdfSnapshot.filename}"`);
      return res!.send(Buffer.from(pdfSnapshot.data));
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
      res!.setHeader('Content-Type', 'application/pdf');
      res!.setHeader('Content-Disposition', `attachment; filename="bon-${bon.reference}.pdf"`);
      return res!.send(Buffer.from(legacySnapshot));
    }

    // Generate on-the-fly
    res!.setHeader('Content-Type', 'application/pdf');
    res!.setHeader('Content-Disposition', `attachment; filename="bon-${bon.reference}.pdf"`);
    const sigImages = await this.signatureService.getSignatureImagesForBon(bon.signatures || []);
    const pdf = await this.pdfService.generateBonPdf(bon, sigImages, type);
    res!.send(pdf);
  }

  /** Verify access: collaborators see only their bons, technicians see only their filiale's bons */
  private async verifyCollaboratorAccess(bonId: string, user?: AuthUser): Promise<void> {
    if (!user) return;
    // Admins have full access
    if (user.role === 'admin') return;

    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: { collaborateurId: true, filialeId: true },
    });
    if (!bon) return;

    if (user.role === 'collaborator') {
      if (bon.collaborateurId !== user.id) {
        throw new ForbiddenException('Accès refusé à ce bon');
      }
    } else if (user.role === 'technician') {
      // Technicians can only access bons of their own filiale
      if (user.filialeId && user.filialeId !== bon.filialeId) {
        throw new ForbiddenException('Accès refusé : ce bon appartient à une autre filiale');
      }
    }
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
