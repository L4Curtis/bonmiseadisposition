import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { DeprecatedAlias } from '../common/http/deprecated-alias';
import { toFullListResponse } from '../common/pagination';
import { CONNECTION_TEST_THROTTLE, IMPORT_THROTTLE } from '../common/throttle-limits';
import { isDeliverableEmail } from '../common/email';
import type { OkResponse } from '../contracts/common';
import type {
  EmailTemplateBonPreviewResponse,
  EmailTemplateHtmlResponse,
  EmailTemplatePreviewResponse,
  EmailTemplateTestResponse,
  TemplatesImportResponse,
} from '../contracts/templates';
import { TemplatesService } from './templates.service';
import { TemplateTestMailerService } from './template-test-mailer.service';
import { TemplateBonPreviewService } from './template-bon-preview.service';
import { EmailTemplateTestDto, toImportItems, UpdateEmailTemplateDto } from './dto/email-template.dto';

function deliverableEmail(raw: string): string {
  const email = raw.trim();
  if (!isDeliverableEmail(email)) throw new BadRequestException('Une adresse email valide est requise');
  return email;
}

/**
 * Modèles d'email (écran Modèles de l'administration) : catalogue, HTML,
 * aperçus (données d'exemple ou vrai bon), enregistrement, retour au modèle
 * par défaut, export, import et email de test. Réservé à l'administrateur.
 *
 * Anciennement sous `/admin/email-templates` : ces chemins restent servis en
 * alias dépréciés. Les routes statiques sont déclarées avant `:id`.
 */
@Controller('email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class EmailTemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly testMailer: TemplateTestMailerService,
    private readonly bonPreviewService: TemplateBonPreviewService,
  ) {}

  @Get()
  @DeprecatedAlias('/admin/email-templates')
  async findAll() {
    return toFullListResponse(await this.templatesService.getAll());
  }

  @Get('export')
  @DeprecatedAlias('/admin/email-templates/export')
  exportAll() {
    return this.templatesService.exportAll();
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @DeprecatedAlias('/admin/email-templates/import')
  @Throttle(IMPORT_THROTTLE)
  importAll(
    @Body() body: { templates?: unknown },
    @CurrentUser() user: AuthUser,
  ): Promise<TemplatesImportResponse> {
    if (!Array.isArray(body?.templates)) {
      throw new BadRequestException('Le fichier doit contenir une liste « templates »');
    }
    return this.templatesService.importAll({ templates: toImportItems(body.templates) }, user.id);
  }

  /** Recherche d'un bon par référence pour l'aperçu (10 résultats au plus). */
  @Get('preview-bons')
  @DeprecatedAlias('/admin/email-templates/preview-bons')
  async searchBons(@Query('q') q?: string) {
    return toFullListResponse(await this.bonPreviewService.searchBons(typeof q === 'string' ? q : undefined));
  }

  @Get(':id/html')
  @DeprecatedAlias('/admin/email-templates/:id/html')
  async getHtml(@Param('id') id: string): Promise<EmailTemplateHtmlResponse> {
    const tpl = this.templatesService.getTemplateById(id);
    const html = await this.templatesService.getTemplateHtml(id);
    const defaultHtml = this.templatesService.getDefaultHtml(id);
    return { html, defaultHtml, isCustomized: html !== defaultHtml, variables: tpl.variables };
  }

  /** Rendu avec les données d'exemple. */
  @Get(':id/preview')
  @DeprecatedAlias('/admin/email-templates/:id/preview')
  async getPreview(@Param('id') id: string): Promise<EmailTemplatePreviewResponse> {
    return { html: await this.templatesService.getPreviewHtml(id) };
  }

  /** Rendu avec les données d'un vrai bon — lecture seule, lien de signature factice. */
  @Get(':id/preview-bon/:bonId')
  @DeprecatedAlias('/admin/email-templates/:id/preview-bon/:bonId')
  previewWithBon(
    @Param('id') id: string,
    @Param('bonId', new ParseUUIDPipe()) bonId: string,
  ): Promise<EmailTemplateBonPreviewResponse> {
    return this.bonPreviewService.render(id, bonId);
  }

  @Patch(':id')
  @DeprecatedAlias('/admin/email-templates/:id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateEmailTemplateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OkResponse> {
    await this.templatesService.updateTemplate(id, body.html, user.id);
    return { ok: true };
  }

  /** Retour au modèle par défaut. */
  @Delete(':id')
  @DeprecatedAlias('/admin/email-templates/:id')
  async reset(@Param('id') id: string): Promise<OkResponse> {
    await this.templatesService.resetTemplate(id);
    return { ok: true };
  }

  /** Email de test avec les données d'exemple : 200 `{ ok, message }`, `ok` faux si l'envoi a échoué. */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @DeprecatedAlias('/admin/email-templates/:id/test')
  @Throttle(CONNECTION_TEST_THROTTLE)
  sendTest(
    @Param('id') id: string,
    @Body() body: EmailTemplateTestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EmailTemplateTestResponse> {
    return this.testMailer.sendTest(id, deliverableEmail(body.email), user.id);
  }

  /** Email de test avec les données du bon `bonId` (tracé au journal). */
  @Post(':id/test-bon')
  @HttpCode(HttpStatus.OK)
  @DeprecatedAlias('/admin/email-templates/:id/test-bon')
  @Throttle(CONNECTION_TEST_THROTTLE)
  sendTestWithBon(
    @Param('id') id: string,
    @Body() body: EmailTemplateTestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EmailTemplateTestResponse> {
    if (!body.bonId) throw new BadRequestException('Un bon valide est requis');
    return this.testMailer.sendTest(id, deliverableEmail(body.email), user.id, body.bonId);
  }
}
