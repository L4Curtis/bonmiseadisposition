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
import { SignItDto } from '../signature/dto/sign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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
  getMyBons(@CurrentUser() user: any) {
    return this.bonsService.findByCollaborateur(user.id);
  }

  /** POST /bons/:id/contestation — collaborateur conteste son bon */
  @Post(':id/contestation')
  @Roles('admin', 'technician', 'collaborator')
  createContestation(
    @Param('id') id: string,
    @Body('message') message: string,
    @CurrentUser() user: any,
  ) {
    return this.contestationService.create(id, user.id, message);
  }

  /** POST /bons/:id/resend — IT renvoie le lien de signature */
  @Post(':id/resend')
  resend(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bonsService.resendSignatureLink(id, user.id);
  }

  // Static routes BEFORE parameterized routes
  @Get('stats')
  getStats() {
    return this.bonsService.getStats();
  }

  @Get('recent')
  getRecent(@Query('limit') limit?: string) {
    return this.bonsService.getRecentBons(limit ? parseInt(limit) : 10);
  }

  @Get('export')
  async exportCsv(
    @Query('status') status?: string,
    @Query('filialeId') filialeId?: string,
    @Query('search') search?: string,
    @Res() res?: Response,
  ) {
    const csv = await this.bonsService.getExportData({ status, filialeId, search });
    const filename = `bons-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res!.send(csv);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('filialeId') filialeId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bonsService.findAll({
      status,
      filialeId,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bonsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBonDto, @CurrentUser() user: any) {
    return this.bonsService.create(dto, user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBonDto) {
    return this.bonsService.update(id, dto);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.bonsService.cancel(id);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bonsService.send(id, user?.id);
  }

  @Post(':id/initiate-restitution')
  initiateRestitution(
    @Param('id') id: string,
    @Body('returnedEquipmentIds') returnedEquipmentIds: string[],
    @CurrentUser() user: any,
  ) {
    return this.bonsService.initiateRestitution(id, user?.id, returnedEquipmentIds);
  }

  @Post(':id/initiate-inperson')
  initiateInPerson(
    @Param('id') id: string,
    @Body('type') type: 'mise_disposition' | 'restitution',
    @CurrentUser() user: any,
  ) {
    return this.bonsService.initiateInPersonSignature(id, type, user.id);
  }

  @Post(':id/declare-not-returned')
  declareNotReturned(
    @Param('id') id: string,
    @Body('equipmentIds') equipmentIds: string[],
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.bonsService.declareNotReturned(id, equipmentIds, reason, user.id);
  }

  @Get(':id/pdf-snapshots')
  @Roles('admin', 'technician', 'collaborator')
  async getPdfSnapshots(@Param('id') id: string) {
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
  ) {
    const bon = await this.bonsService.findOne(id);

    // If specific stage requested, serve from PdfSnapshot table
    if (stage) {
      const pdfSnapshot = await this.prisma.pdfSnapshot.findUnique({
        where: { bonId_type: { bonId: (bon as any).id, type: stage as any } },
      });
      if (pdfSnapshot) {
        res!.setHeader('Content-Type', 'application/pdf');
        res!.setHeader('Content-Disposition', `attachment; filename="${pdfSnapshot.filename}"`);
        return res!.send(Buffer.from(pdfSnapshot.data));
      }
    }

    // Default: serve best available snapshot
    const snapshotType = type === 'restitution'
      ? 'signature_collab_restitution'
      : 'signature_collab_mise_disposition';
    const pdfSnapshot = await this.prisma.pdfSnapshot.findUnique({
      where: { bonId_type: { bonId: (bon as any).id, type: snapshotType as any } },
    });

    if (pdfSnapshot) {
      res!.setHeader('Content-Type', 'application/pdf');
      res!.setHeader('Content-Disposition', `attachment; filename="${pdfSnapshot.filename}"`);
      return res!.send(Buffer.from(pdfSnapshot.data));
    }

    // Fallback: legacy snapshot columns
    const legacySnapshot =
      type === 'restitution'
        ? (bon as any).pdfRestitutionSnapshot
        : (bon as any).pdfMiseDispoSnapshot;

    if (legacySnapshot) {
      res!.setHeader('Content-Type', 'application/pdf');
      res!.setHeader('Content-Disposition', `attachment; filename="bon-${bon.reference}.pdf"`);
      return res!.send(Buffer.from(legacySnapshot));
    }

    // Generate on-the-fly
    res!.setHeader('Content-Type', 'application/pdf');
    res!.setHeader('Content-Disposition', `attachment; filename="bon-${bon.reference}.pdf"`);
    const sigImages = await this.signatureService.getSignatureImagesForBon((bon as any).signatures || []);
    const pdf = await this.pdfService.generateBonPdf(bon, sigImages, type);
    res!.send(pdf);
  }

  @Post(':id/sign-it')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async signIt(
    @Param('id') id: string,
    @Body() body: SignItDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
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
