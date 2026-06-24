import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

@Controller('bons/:bonId/attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician', 'collaborator')
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@Param('bonId') bonId: string, @CurrentUser() user: AuthUser) {
    await this.verifyAccess(bonId, user);
    return this.attachments.list(bonId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  async upload(
    @Param('bonId') bonId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('stage') stage: string | undefined,
    @Body('label') label: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyAccess(bonId, user);
    if (!file) throw new BadRequestException('Aucun fichier reçu (champ "file" attendu)');
    return this.attachments.create(
      bonId,
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype, size: file.size },
      stage,
      label,
      { id: user.id, email: user.email },
    );
  }

  @Get(':attachmentId')
  async download(
    @Param('bonId') bonId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    await this.verifyAccess(bonId, user);
    const { buffer, filename, mimeType } = await this.attachments.download(bonId, attachmentId);
    res.setHeader('Content-Type', mimeType);
    // Images en inline (prévisualisation), PDF en téléchargement
    const disposition = mimeType.startsWith('image/') ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    return res.send(buffer);
  }

  @Delete(':attachmentId')
  @Roles('admin', 'technician')
  async remove(
    @Param('bonId') bonId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyAccess(bonId, user);
    return this.attachments.remove(bonId, attachmentId, { id: user.id, email: user.email });
  }

  /** Collaborateurs : accès limité à leurs propres bons (cf. BonsController). */
  private async verifyAccess(bonId: string, user: AuthUser): Promise<void> {
    if (!user) throw new ForbiddenException('Accès refusé');
    if (user.role !== 'collaborator') return;
    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: { collaborateurId: true },
    });
    if (!bon) return; // 404 produit par le service
    if (bon.collaborateurId !== user.id) {
      throw new ForbiddenException('Accès refusé à ce bon');
    }
  }
}
