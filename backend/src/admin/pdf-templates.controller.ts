import {
  Controller, Get, Patch, Delete, Post, Body, Param, Res,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { PdfTemplatesService } from '../pdf/pdf-templates.service';
import { PdfService } from '../pdf/pdf.service';
import { PREVIEW_BON } from '../pdf/pdf-template-config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { UpdatePdfTemplateDto } from '../pdf/dto/update-pdf-template.dto';

@Controller('admin/pdf-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PdfTemplatesController {
  constructor(
    private readonly pdfTemplatesService: PdfTemplatesService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @Roles('admin', 'technician')
  findAll() {
    return this.pdfTemplatesService.getAll();
  }

  /** Export all PDF template configs as JSON */
  @Get('export')
  @Roles('admin', 'technician')
  exportAll() {
    return this.pdfTemplatesService.exportAll();
  }

  /** Import PDF template configs from JSON payload */
  @Post('import')
  @Roles('admin')
  async importAll(
    @Body() body: { templates: { id: string; config: Record<string, unknown> }[] },
    @CurrentUser() user: AuthUser,
  ) {
    if (!Array.isArray(body?.templates)) {
      throw new BadRequestException('Le corps doit contenir un tableau "templates"');
    }
    return this.pdfTemplatesService.importAll(body, user?.id);
  }

  /** Get current config for a template (custom merged with default) */
  @Get(':id/config')
  @Roles('admin', 'technician')
  async getConfig(@Param('id') id: string) {
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

  /** Generate a preview PDF with sample data */
  @Get(':id/preview')
  @Roles('admin', 'technician')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getPreview(@Param('id') id: string, @Res() res: Response) {
    const tpl = this.pdfTemplatesService.getTemplateById(id);
    const config = await this.pdfTemplatesService.getTemplateConfig(id);
    const pdfBuffer = await this.pdfService.generateBonPdf(
      PREVIEW_BON,
      { it: null, collab: null },
      tpl.documentType,
      config,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="preview-${id}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }

  /** Update a PDF template config (partial) */
  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: UpdatePdfTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!body || Object.keys(body).length === 0) {
      throw new BadRequestException('Le corps de la requête ne peut pas être vide');
    }
    await this.pdfTemplatesService.updateTemplate(id, body as Record<string, unknown>, user?.id);
    return { success: true };
  }

  /** Reset a PDF template to its default */
  @Delete(':id')
  @Roles('admin')
  async reset(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.pdfTemplatesService.resetTemplate(id, user?.id);
    return { success: true };
  }
}
