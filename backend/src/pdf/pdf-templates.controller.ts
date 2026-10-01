import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Res, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { DeprecatedAlias } from '../common/http/deprecated-alias';
import { toFullListResponse } from '../common/pagination';
import { IMPORT_THROTTLE } from '../common/throttle-limits';
import type { OkResponse } from '../contracts/common';
import type {
  PdfTemplateConfigResponse,
  TemplatesImportResponse,
} from '../contracts/templates';
import { PdfTemplatesService } from './pdf-templates.service';
import { PdfService } from './pdf.service';
import { PREVIEW_BON } from './pdf-template-config';
import { UpdatePdfTemplateDto } from './dto/update-pdf-template.dto';

/** Aperçu PDF : génération coûteuse, 10 par minute. */
const PREVIEW_THROTTLE = { default: { limit: 10, ttl: 60_000 } } as const;

/** Lignes d'un fichier d'import : une ligne illisible devient une ligne vide,
 *  que l'import compte comme ignorée (identifiant inconnu). */
function toImportItems(rows: readonly unknown[]): { id: string; config: Record<string, unknown> }[] {
  return rows.map((row) => {
    const item = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {};
    const config = typeof item.config === 'object' && item.config !== null ? (item.config as Record<string, unknown>) : {};
    return { id: typeof item.id === 'string' ? item.id : '', config };
  });
}

/**
 * Modèles des documents PDF (écran Modèles de l'administration) : catalogue,
 * configuration, aperçu, enregistrement, retour au modèle par défaut, export
 * et import. Réservé à l'administrateur.
 *
 * Anciennement sous `/admin/pdf-templates` : ces chemins restent servis en
 * alias dépréciés. Déclaré par TemplatesModule, qui réunit tous les modèles.
 */
@Controller('pdf-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PdfTemplatesController {
  constructor(
    private readonly pdfTemplatesService: PdfTemplatesService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @DeprecatedAlias('/admin/pdf-templates')
  async findAll() {
    return toFullListResponse(await this.pdfTemplatesService.getAll());
  }

  @Get('export')
  @DeprecatedAlias('/admin/pdf-templates/export')
  exportAll() {
    return this.pdfTemplatesService.exportAll();
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @DeprecatedAlias('/admin/pdf-templates/import')
  @Throttle(IMPORT_THROTTLE)
  importAll(@Body() body: { templates?: unknown }, @CurrentUser() user: AuthUser): Promise<TemplatesImportResponse> {
    if (!Array.isArray(body?.templates)) {
      throw new BadRequestException('Le fichier doit contenir une liste « templates »');
    }
    return this.pdfTemplatesService.importAll({ templates: toImportItems(body.templates) }, user.id);
  }

  /** Configuration courante (personnalisation fusionnée avec le modèle par défaut). */
  @Get(':id/config')
  @DeprecatedAlias('/admin/pdf-templates/:id/config')
  async getConfig(@Param('id') id: string): Promise<PdfTemplateConfigResponse> {
    const tpl = this.pdfTemplatesService.getTemplateById(id);
    const config = await this.pdfTemplatesService.getTemplateConfig(id);
    const defaultConfig = this.pdfTemplatesService.getDefaultConfig(id);
    return {
      config,
      defaultConfig,
      isCustomized: JSON.stringify(config) !== JSON.stringify(defaultConfig),
      variables: tpl.variables,
    };
  }

  /** PDF d'aperçu, rendu avec un bon d'exemple. */
  @Get(':id/preview')
  @DeprecatedAlias('/admin/pdf-templates/:id/preview')
  @Throttle(PREVIEW_THROTTLE)
  async getPreview(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const tpl = this.pdfTemplatesService.getTemplateById(id);
    const config = await this.pdfTemplatesService.getTemplateConfig(id);
    const pdfBuffer = await this.pdfService.generateBonPdf(PREVIEW_BON, { it: null, collab: null }, tpl.documentType, config);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="preview-${id}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }

  /** Enregistrement partiel de la configuration. */
  @Patch(':id')
  @DeprecatedAlias('/admin/pdf-templates/:id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdatePdfTemplateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OkResponse> {
    if (!body || Object.keys(body).length === 0) {
      throw new BadRequestException('Aucune modification à enregistrer');
    }
    await this.pdfTemplatesService.updateTemplate(id, body as Record<string, unknown>, user.id);
    return { ok: true };
  }

  /** Retour au modèle par défaut. */
  @Delete(':id')
  @DeprecatedAlias('/admin/pdf-templates/:id')
  async reset(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<OkResponse> {
    await this.pdfTemplatesService.resetTemplate(id, user.id);
    return { ok: true };
  }
}
