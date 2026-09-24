import {
  BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { TemplateBonPreviewService } from './template-bon-preview.service';
import { TemplateTestMailerService } from './template-test-mailer.service';
import { isDeliverableEmail } from '../common/email';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Aperçu d'un modèle d'email avec un vrai bon (lot H3). Mêmes droits que
 * l'aperçu avec données d'exemple (admin, technicien) ; l'envoi d'un email de
 * test reste réservé à l'administrateur, comme POST :id/test.
 *
 * Les segments `preview-bons` et `:id/preview-bon/:bonId` ne recoupent aucune
 * route d'admin/templates.controller.ts (même préfixe).
 */
@Controller('admin/email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplateBonPreviewController {
  constructor(
    private readonly bonPreviewService: TemplateBonPreviewService,
    private readonly templateTestMailerService: TemplateTestMailerService,
  ) {}

  /** Recherche d'un bon par référence pour l'aperçu (10 résultats au plus). */
  @Get('preview-bons')
  @Roles('admin', 'technician')
  searchBons(@Query('q') q?: string) {
    return this.bonPreviewService.searchBons(typeof q === 'string' ? q : undefined);
  }

  /** Rendu du modèle avec les données du bon — lecture seule, lien de signature factice. */
  @Get(':id/preview-bon/:bonId')
  @Roles('admin', 'technician')
  previewWithBon(
    @Param('id') id: string,
    @Param('bonId', new ParseUUIDPipe()) bonId: string,
  ) {
    return this.bonPreviewService.render(id, bonId);
  }

  /** Email de test rendu avec les données du bon, envoyé à l'adresse indiquée (tracé dans l'audit). */
  @Post(':id/test-bon')
  @Roles('admin')
  async sendTestWithBon(
    @Param('id') id: string,
    @Body() body: { email?: unknown; bonId?: unknown },
    @CurrentUser() user: AuthUser,
  ) {
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!email || !isDeliverableEmail(email)) {
      throw new BadRequestException('Une adresse email valide est requise');
    }
    const bonId = typeof body?.bonId === 'string' ? body.bonId : '';
    if (!UUID_RE.test(bonId)) {
      throw new BadRequestException('Un bon valide est requis');
    }
    return this.templateTestMailerService.sendTest(id, email, user?.id, bonId);
  }
}
