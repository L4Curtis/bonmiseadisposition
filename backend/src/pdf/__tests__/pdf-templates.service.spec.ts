import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PdfTemplatesService } from '../pdf-templates.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { DEFAULT_CONFIGS, PDF_TEMPLATE_DEFINITIONS } from '../pdf-template-config';

describe('PdfTemplatesService', () => {
  let service: PdfTemplatesService;
  let configService: ReturnType<typeof createMockConfigService>;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    configService = createMockConfigService();
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfTemplatesService,
        { provide: AppConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PdfTemplatesService>(PdfTemplatesService);
  });

  // ─── getAll ─────────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return 4 templates with isCustomized=false when no custom config', async () => {
      configService.getAll.mockResolvedValue({});

      const result = await service.getAll();

      expect(result).toHaveLength(4);
      expect(result.every((t) => t.isCustomized === false)).toBe(true);
      expect(result.map((t) => t.id)).toEqual([
        'mise_disposition', 'restitution', 'cloture', 'avenant',
      ]);
    });

    it('should mark customized templates', async () => {
      configService.getAll.mockResolvedValue({
        mise_disposition: '{"colors":{"primary":"#ff0000"}}',
      });

      const result = await service.getAll();

      const miseDispoTpl = result.find((t) => t.id === 'mise_disposition');
      const restitutionTpl = result.find((t) => t.id === 'restitution');
      expect(miseDispoTpl?.isCustomized).toBe(true);
      expect(restitutionTpl?.isCustomized).toBe(false);
    });
  });

  // ─── getTemplateById ────────────────────────────────────────────────────────

  describe('getTemplateById', () => {
    it('should return template definition for valid id', () => {
      const result = service.getTemplateById('mise_disposition');

      expect(result.id).toBe('mise_disposition');
      expect(result.name).toBe('Bon de mise à disposition');
      expect(result.documentType).toBe('mise_disposition');
    });

    it('should throw NotFoundException for unknown id', () => {
      expect(() => service.getTemplateById('unknown')).toThrow(NotFoundException);
    });
  });

  // ─── getDefaultConfig ───────────────────────────────────────────────────────

  describe('getDefaultConfig', () => {
    it('should return default config for each document type', () => {
      for (const tpl of PDF_TEMPLATE_DEFINITIONS) {
        const config = service.getDefaultConfig(tpl.id);

        expect(config).toBeDefined();
        expect(config.colors.primary).toBe('#D8372B');
        expect(config.fonts.titleSize).toBe(14);
        expect(config.margins.top).toBe(50);
        expect(config.header.showLogo).toBe(true);
        expect(config.signatures.showSignatures).toBe(true);
        expect(config.footer.showFooter).toBe(true);
      }
    });

    it('should return a deep clone (not same reference)', () => {
      const config1 = service.getDefaultConfig('mise_disposition');
      const config2 = service.getDefaultConfig('mise_disposition');

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
      config1.colors.primary = '#000000';
      expect(config2.colors.primary).toBe('#D8372B');
    });

    it('should throw for unknown id', () => {
      expect(() => service.getDefaultConfig('fake')).toThrow(NotFoundException);
    });
  });

  // ─── getTemplateConfig ──────────────────────────────────────────────────────

  describe('getTemplateConfig', () => {
    it('should return defaults when no custom config exists', async () => {
      configService.get.mockResolvedValue(null);

      const config = await service.getTemplateConfig('mise_disposition');

      expect(config).toEqual(DEFAULT_CONFIGS['mise_disposition']);
    });

    it('should deep-merge partial custom config over defaults', async () => {
      const customPartial = { colors: { primary: '#ff0000' } };
      configService.get.mockResolvedValue(JSON.stringify(customPartial));

      const config = await service.getTemplateConfig('mise_disposition');

      expect(config.colors.primary).toBe('#ff0000');
      // Other colors remain default
      expect(config.colors.dark).toBe('#1B1A18');
      expect(config.colors.gray).toBe('#6B665E');
      // Other sections remain default
      expect(config.fonts.titleSize).toBe(14);
      expect(config.header.titleText).toBe('BON DE MISE À DISPOSITION');
    });

    it('should fall back to defaults if custom config is corrupted JSON', async () => {
      configService.get.mockResolvedValue('not valid json {{{');

      const config = await service.getTemplateConfig('mise_disposition');

      expect(config).toEqual(DEFAULT_CONFIGS['mise_disposition']);
    });
  });

  // ─── updateTemplate ─────────────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('should save config to AppConfig and create audit log', async () => {
      const partialConfig = { colors: { primary: '#ff0000' } };

      await service.updateTemplate('mise_disposition', partialConfig, 'user-123');

      expect(configService.set).toHaveBeenCalledWith(
        'pdf_templates',
        'mise_disposition',
        JSON.stringify(partialConfig),
        { updatedById: 'user-123' },
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'pdf_template_updated',
          userId: 'user-123',
          details: { templateId: 'mise_disposition' },
        },
      });
    });

    it('should throw for unknown template id', async () => {
      await expect(
        service.updateTemplate('unknown', {}, 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── resetTemplate ──────────────────────────────────────────────────────────

  describe('resetTemplate', () => {
    it('should delete custom config and invalidate cache', async () => {
      await service.resetTemplate('mise_disposition', 'user-123');

      expect(prisma.appConfig.deleteMany).toHaveBeenCalledWith({
        where: { category: 'pdf_templates', key: 'mise_disposition' },
      });
      expect(configService.invalidateCache).toHaveBeenCalledWith('pdf_templates', 'mise_disposition');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'pdf_template_reset',
          userId: 'user-123',
          details: { templateId: 'mise_disposition' },
        },
      });
    });

    it('should throw for unknown template id', async () => {
      await expect(
        service.resetTemplate('unknown', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── exportAll ──────────────────────────────────────────────────────────────

  describe('exportAll', () => {
    it('should return all 4 templates with config and exportedAt', async () => {
      configService.getAll.mockResolvedValue({});

      const result = await service.exportAll();

      expect(result.exportedAt).toBeDefined();
      expect(result.templates).toHaveLength(4);
      result.templates.forEach((t) => {
        expect(t.id).toBeDefined();
        expect(t.name).toBeDefined();
        expect(t.config).toBeDefined();
        expect(t.config.colors).toBeDefined();
        expect(t.config.fonts).toBeDefined();
      });
    });
  });

  // ─── importAll ──────────────────────────────────────────────────────────────

  describe('importAll', () => {
    it('should import valid templates and skip unknown ids', async () => {
      const data = {
        templates: [
          { id: 'mise_disposition', config: { colors: { primary: '#ff0000' } } },
          { id: 'unknown_template', config: {} },
        ],
      };

      const result = await service.importAll(data, 'user-123');

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(configService.set).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'pdf_templates_imported',
          userId: 'user-123',
          details: { imported: 1, skipped: 1 },
        },
      });
    });

    it('should not create audit log when nothing imported', async () => {
      const data = { templates: [{ id: 'unknown', config: {} }] };

      const result = await service.importAll(data, 'user-123');

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
