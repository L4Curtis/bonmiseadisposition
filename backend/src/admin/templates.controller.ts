import {
  Controller, Get, Patch, Delete, Post, Body, Param, UseGuards, BadRequestException,
} from '@nestjs/common';
import { TemplatesService } from '../templates/templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

@Controller('admin/email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @Roles('admin', 'technician')
  findAll() {
    return this.templatesService.getAll();
  }

  /** Export all templates as JSON (custom or default) */
  @Get('export')
  @Roles('admin', 'technician')
  exportAll() {
    return this.templatesService.exportAll();
  }

  /** Import templates from a JSON payload */
  @Post('import')
  @Roles('admin')
  async importAll(
    @Body() body: { templates: { id: string; html: string }[] },
    @CurrentUser() user: AuthUser,
  ) {
    if (!Array.isArray(body?.templates)) {
      throw new BadRequestException('Le corps doit contenir un tableau "templates"');
    }
    return this.templatesService.importAll(body, user?.id);
  }

  /** Get current HTML for a template (custom or default) */
  @Get(':id/html')
  @Roles('admin', 'technician')
  async getHtml(@Param('id') id: string) {
    const html = await this.templatesService.getTemplateHtml(id);
    const tpl = this.templatesService.getTemplateById(id);
    const defaultHtml = this.templatesService.getDefaultHtml(id);
    return {
      html,
      defaultHtml,
      isCustomized: html !== defaultHtml,
      variables: tpl.variables,
    };
  }

  /** Get rendered preview HTML with sample data */
  @Get(':id/preview')
  @Roles('admin', 'technician')
  async getPreview(@Param('id') id: string) {
    return { html: await this.templatesService.getPreviewHtml(id) };
  }

  /** Save a custom template */
  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: { html: string },
    @CurrentUser() user: AuthUser,
  ) {
    if (typeof body?.html !== 'string' || !body.html.trim()) {
      throw new BadRequestException('Le champ "html" est requis');
    }
    await this.templatesService.updateTemplate(id, body.html, user?.id);
    return { success: true };
  }

  /** Reset a template to its default */
  @Delete(':id')
  @Roles('admin')
  async reset(@Param('id') id: string) {
    await this.templatesService.resetTemplate(id);
    return { success: true };
  }
}
