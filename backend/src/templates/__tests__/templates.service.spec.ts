import { BadRequestException } from '@nestjs/common';
import { TemplatesService } from '../templates.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import type { Mock } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMock = (fn: unknown): Mock => fn as any;

const VALID_SIGNER_HTML = '<html>{{SIGNER_URL}}</html>';
const VALID_NON_SIGNER_HTML = '<html>{{REFERENCE}}</html>';

describe('TemplatesService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: ReturnType<typeof createMockConfigService>;
  let service: TemplatesService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    config = createMockConfigService();
    service = new TemplatesService(config as never, prisma as never);
    asMock(prisma.appConfig.upsert).mockResolvedValue({});
  });

  // ─── updateTemplate ────────────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('saves a valid template', async () => {
      await service.updateTemplate('mise_disposition_request', VALID_SIGNER_HTML, 'admin-1');
      expect(config.set).toHaveBeenCalledWith(
        'email_templates',
        'mise_disposition_request',
        VALID_SIGNER_HTML,
        { updatedById: 'admin-1' },
      );
    });

    it('rejects an empty template', async () => {
      await expect(service.updateTemplate('reminder', '   ')).rejects.toThrow(BadRequestException);
      expect(config.set).not.toHaveBeenCalled();
    });

    it('rejects a template exceeding the maximum size', async () => {
      const huge = 'a'.repeat(200_001);
      await expect(service.updateTemplate('reminder', huge)).rejects.toThrow(BadRequestException);
    });

    it('rejects a "to sign" template missing {{SIGNER_URL}}', async () => {
      await expect(
        service.updateTemplate('mise_disposition_request', VALID_NON_SIGNER_HTML),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects restitution_request and pv_cloture_request missing {{SIGNER_URL}} too', async () => {
      await expect(
        service.updateTemplate('restitution_request', VALID_NON_SIGNER_HTML),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateTemplate('pv_cloture_request', VALID_NON_SIGNER_HTML),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not require {{SIGNER_URL}} for a non-signer template', async () => {
      await expect(
        service.updateTemplate('confirmation_pv_cloture', VALID_NON_SIGNER_HTML),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException for an unknown template id', async () => {
      await expect(service.updateTemplate('does_not_exist', VALID_NON_SIGNER_HTML)).rejects.toThrow();
    });
  });

  // ─── importAll ─────────────────────────────────────────────────────────────

  describe('importAll', () => {
    it('imports valid templates in a single transaction and counts skipped ones', async () => {
      const result = await service.importAll({
        templates: [
          // 'contestation_alert' n'exige pas {{SIGNER_URL}} (contrairement à 'reminder', qui le relaie lui aussi désormais)
          { id: 'contestation_alert', html: VALID_NON_SIGNER_HTML },
          { id: 'unknown_template', html: VALID_NON_SIGNER_HTML }, // id inconnu
          { id: 'confirmation_restitution', html: '   ' }, // vide
          { id: 'mise_disposition_request', html: VALID_NON_SIGNER_HTML }, // {{SIGNER_URL}} manquant
          { id: 'mise_disposition_request', html: VALID_SIGNER_HTML }, // valide
        ],
      });

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(3);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.appConfig.upsert).toHaveBeenCalledTimes(2);
    });

    it('rejects an oversized template during import (skipped, not thrown)', async () => {
      const huge = 'a'.repeat(200_001);
      const result = await service.importAll({ templates: [{ id: 'reminder', html: huge }] });

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes nothing when every item is invalid', async () => {
      const result = await service.importAll({ templates: [{ id: 'nope', html: 'x' }] });

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(prisma.appConfig.upsert).not.toHaveBeenCalled();
    });

    it('requires {{SIGNER_URL}} for "reminder" too (relayed to the collaborator)', async () => {
      const result = await service.importAll({
        templates: [{ id: 'reminder', html: VALID_NON_SIGNER_HTML }],
      });

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('skips a null html on a signer-required template without throwing (htmlOk checked before signerOk)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templates = [{ id: 'mise_disposition_request', html: null as any }];

      await expect(service.importAll({ templates })).resolves.toEqual({ imported: 0, skipped: 1 });
      expect(prisma.appConfig.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── confirmation_pv_cloture (nouveau template) ─────────────────────────────

  describe('confirmation_pv_cloture', () => {
    it('is a known template with the expected variables', () => {
      const tpl = service.getTemplateById('confirmation_pv_cloture');
      expect(tpl.variables.map((v) => v.name)).toEqual(
        expect.arrayContaining(['FILIALE_NOM', 'REFERENCE', 'TYPE_LABEL']),
      );
    });

    it('renders default HTML distinct from confirmation_restitution', () => {
      const pvHtml = service.getDefaultHtml('confirmation_pv_cloture');
      const restitutionHtml = service.getDefaultHtml('confirmation_restitution');
      expect(pvHtml).toContain('{{TYPE_LABEL}}');
      expect(pvHtml).not.toEqual(restitutionHtml);
      expect(pvHtml).toContain('Procès-verbal de clôture');
    });

    it('is used by getAll()', async () => {
      const all = await service.getAll();
      expect(all.some((t) => t.id === 'confirmation_pv_cloture')).toBe(true);
    });
  });
});
