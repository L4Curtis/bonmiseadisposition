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
import { Roles, ALL_ROLES } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { isItRole } from '../common/roles';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Statuts pendant lesquels un collaborateur peut encore ajouter/supprimer des
 * pièces jointes — la « période de signature ». Hors de cette fenêtre (bon
 * brouillon, archivé, contesté…) le bon est figé côté collaborateur : ajouter
 * une PJ après coup modifierait un dossier déjà clos/probant.
 */
const COLLAB_ATTACHMENT_WINDOW_STATUSES = ['sent_mise_dispo', 'sent_restitution', 'partially_returned'];

/**
 * Pièces jointes d'un bon. Ouvert à tout rôle connecté comme les autres routes
 * « propriétaire » des bons : un compte non IT n'accède qu'aux pièces de SES
 * bons (verifyAccess), et n'en ajoute ou n'en retire que pendant la période de
 * signature.
 */
@Controller('bons/:bonId/attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_ROLES)
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
    await this.verifyCollaboratorWriteWindow(
      bonId,
      user,
      'Vous ne pouvez ajouter des pièces jointes que pendant la période de signature',
    );
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

  // Un collaborateur ne peut supprimer que SES PROPRES pièces jointes,
  // pendant la même fenêtre que l'upload — pas de @Roles restrictif ici :
  // hérite du niveau classe (tout rôle connecté), la restriction fine est
  // appliquée dans le corps de la méthode.
  @Delete(':attachmentId')
  async remove(
    @Param('bonId') bonId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.verifyAccess(bonId, user);
    await this.verifyCollaboratorWriteWindow(
      bonId,
      user,
      'Vous ne pouvez supprimer des pièces jointes que pendant la période de signature',
    );
    if (!isItRole(user.role)) {
      await this.verifyOwnAttachment(bonId, attachmentId, user);
    }
    return this.attachments.remove(bonId, attachmentId, { id: user.id, email: user.email });
  }

  /** Collaborateurs : accès limité à leurs propres bons (cf. BonsController). */
  private async verifyAccess(bonId: string, user: AuthUser): Promise<void> {
    if (!user) throw new ForbiddenException('Accès refusé');
    if (isItRole(user.role)) return;
    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: { collaborateurId: true },
    });
    if (!bon) return; // 404 produit par le service
    if (bon.collaborateurId !== user.id) {
      throw new ForbiddenException('Accès refusé à ce bon');
    }
  }

  /**
   * Un collaborateur ne peut ajouter/supprimer des pièces jointes que pendant
   * la période de signature (bon envoyé, en attente de signature ou de
   * restitution partielle). Admin/technician : sans restriction.
   */
  private async verifyCollaboratorWriteWindow(bonId: string, user: AuthUser, message: string): Promise<void> {
    if (isItRole(user.role)) return;
    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: { status: true },
    });
    if (!bon) return; // 404 produit par le service en aval
    if (!COLLAB_ATTACHMENT_WINDOW_STATUSES.includes(bon.status)) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * Un collaborateur ne peut supprimer que ses propres pièces jointes.
   * Si l'auteur n'est pas tracé (PJ ancienne, email non renseigné), on ne
   * peut pas vérifier la propriété : seule la fenêtre de statut s'applique.
   */
  private async verifyOwnAttachment(bonId: string, attachmentId: string, user: AuthUser): Promise<void> {
    const list = await this.attachments.list(bonId);
    const attachment = list.find((a) => a.id === attachmentId);
    if (!attachment) return; // 404 produit par le service en aval
    if (attachment.uploadedByEmail && attachment.uploadedByEmail !== user.email) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres pièces jointes');
    }
  }
}
