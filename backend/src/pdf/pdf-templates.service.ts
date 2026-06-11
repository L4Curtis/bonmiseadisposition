import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePdfTemplateDto } from './dto/update-pdf-template.dto';
import {
  DEFAULT_CONFIGS,
  PDF_TEMPLATE_DEFINITIONS,
  PdfTemplateConfig,
  PdfTemplateDefinition,
  deepMergeConfig,
} from './pdf-template-config';

const CATEGORY = 'pdf_templates';

@Injectable()
export class PdfTemplatesService {
  private readonly logger = new Logger(PdfTemplatesService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Catalogue ──────────────────────────────────────────────────────────────

  async getAll(): Promise<(PdfTemplateDefinition & { isCustomized: boolean })[]> {
    const all = await this.configService.getAll(CATEGORY);
    return PDF_TEMPLATE_DEFINITIONS.map((t) => ({
      ...t,
      isCustomized: !!all[t.id],
    }));
  }

  getTemplateById(id: string): PdfTemplateDefinition {
    const tpl = PDF_TEMPLATE_DEFINITIONS.find((t) => t.id === id);
    if (!tpl) throw new NotFoundException(`Modèle PDF inconnu : ${id}`);
    return tpl;
  }

  // ─── Config retrieval ───────────────────────────────────────────────────────

  getDefaultConfig(id: string): PdfTemplateConfig {
    this.getTemplateById(id);
    const config = DEFAULT_CONFIGS[id];
    if (!config) throw new NotFoundException(`Configuration par défaut introuvable pour : ${id}`);
    return structuredClone(config);
  }

  async getTemplateConfig(id: string): Promise<PdfTemplateConfig> {
    const base = this.getDefaultConfig(id);
    const raw = await this.configService.get(CATEGORY, id);
    if (!raw) return base;

    try {
      const override = JSON.parse(raw) as Partial<Record<string, unknown>>;
      return deepMergeConfig(base, override);
    } catch {
      this.logger.warn(`Configuration PDF corrompue pour ${id}, utilisation des valeurs par défaut`);
      return base;
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async updateTemplate(
    id: string,
    config: Partial<Record<string, unknown>>,
    updatedById?: string,
  ): Promise<void> {
    this.getTemplateById(id);
    const json = JSON.stringify(config);
    await this.configService.set(CATEGORY, id, json, { updatedById });

    await this.prisma.auditLog.create({
      data: {
        action: 'pdf_template_updated',
        userId: updatedById ?? null,
        details: { templateId: id },
      },
    });

    this.logger.log(`Modèle PDF "${id}" mis à jour par ${updatedById ?? 'inconnu'}`);
  }

  async resetTemplate(id: string, userId?: string): Promise<void> {
    this.getTemplateById(id);
    await this.prisma.appConfig.deleteMany({ where: { category: CATEGORY, key: id } });
    this.configService.invalidateCache(CATEGORY, id);

    await this.prisma.auditLog.create({
      data: {
        action: 'pdf_template_reset',
        userId: userId ?? null,
        details: { templateId: id },
      },
    });

    this.logger.log(`Modèle PDF "${id}" réinitialisé par ${userId ?? 'inconnu'}`);
  }

  // ─── Export / Import ────────────────────────────────────────────────────────

  async exportAll(): Promise<{ exportedAt: string; templates: { id: string; name: string; config: PdfTemplateConfig; isCustomized: boolean }[] }> {
    const customized = await this.configService.getAll(CATEGORY);
    const templates = PDF_TEMPLATE_DEFINITIONS.map((t) => {
      const raw = customized[t.id] ?? null;
      let config: PdfTemplateConfig;
      if (raw) {
        try {
          config = deepMergeConfig(this.getDefaultConfig(t.id), JSON.parse(raw) as Partial<Record<string, unknown>>);
        } catch {
          config = this.getDefaultConfig(t.id);
        }
      } else {
        config = this.getDefaultConfig(t.id);
      }
      return { id: t.id, name: t.name, config, isCustomized: !!raw };
    });
    return { exportedAt: new Date().toISOString(), templates };
  }

  async importAll(
    data: { templates: { id: string; config: Record<string, unknown> }[] },
    updatedById?: string,
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    for (const item of data.templates) {
      if (!PDF_TEMPLATE_DEFINITIONS.find((t) => t.id === item.id)) {
        skipped++;
        continue;
      }
      // Imported configs go through the SAME validation as the PATCH endpoint —
      // an import must not be a bypass of the DTO constraints (hex colors,
      // size/margin bounds, text lengths)
      const dto = plainToInstance(UpdatePdfTemplateDto, item.config);
      const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
      if (errors.length > 0) {
        this.logger.warn(`Import du modèle "${item.id}" rejeté: ${errors.map((e) => e.property).join(', ')} invalide(s)`);
        skipped++;
        continue;
      }
      await this.configService.set(CATEGORY, item.id, JSON.stringify(instanceToPlain(dto)), { updatedById });
      imported++;
    }

    if (imported > 0) {
      await this.prisma.auditLog.create({
        data: {
          action: 'pdf_templates_imported',
          userId: updatedById ?? null,
          details: { imported, skipped },
        },
      });
    }

    return { imported, skipped };
  }
}
