import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TemplateBonPreviewService } from '../template-bon-preview.service';
import { TemplatesService } from '../templates.service';
import { AppConfigService } from '../../config/config.service';
import { FAKE_SIGNATURE_TOKEN } from '../bon-preview-vars';
import { TEMPLATES } from '../template-catalog';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

const BON_ID = '11111111-2222-3333-4444-555555555555';

function dbBon(overrides: Record<string, unknown> = {}) {
  return {
    id: BON_ID,
    reference: 'BMD-2026-0107',
    civilite: 'mr',
    status: 'sent_mise_dispo',
    collaborateurEmail: 'paul.durand@livio.fr',
    dateMiseDisposition: new Date('2026-09-01T00:00:00Z'),
    dateRestitution: null,
    anonymizedAt: null,
    collaborateur: { displayName: 'Paul Durand', email: 'paul.durand@livio.fr' },
    filiale: { displayName: 'Livio Sud', name: 'livio-sud' },
    equipments: [{ id: 'e1', order: 0, catalogItem: { brand: 'Dell', model: 'P2425' }, serialNumber: 'SN-9' }],
    signatures: [{ type: 'mise_disposition', signed: false }],
    contestations: [],
    ...overrides,
  };
}

describe('TemplateBonPreviewService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: { get: Mock };
  let templatesService: { getTemplateById: Mock; renderTemplate: Mock };
  let service: TemplateBonPreviewService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    config = { get: vi.fn().mockResolvedValue('https://bons.livio.fr/') };
    templatesService = {
      getTemplateById: vi.fn((id: string) => {
        const tpl = TEMPLATES.find((t) => t.id === id);
        if (!tpl) throw new NotFoundException(`Template "${id}" introuvable`);
        return tpl;
      }),
      renderTemplate: vi.fn(async (_id: string, vars: Record<string, string>) => `<a href="${vars.SIGNER_URL}">${vars.COLLAB_NAME}</a>`),
    };
    service = new TemplateBonPreviewService(
      prisma as never,
      config as unknown as AppConfigService,
      templatesService as unknown as TemplatesService,
    );
  });

  describe('searchBons', () => {
    it('cherche par référence, hors bons anonymisés, 10 au plus', async () => {
      prisma.bon.findMany.mockResolvedValue([
        { id: BON_ID, reference: 'BMD-2026-0107', status: 'active', collaborateur: { displayName: 'Paul Durand' }, filiale: { displayName: null, name: 'livio-sud' } },
      ]);

      const result = await service.searchBons('  0107 ');

      const args = prisma.bon.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ anonymizedAt: null, reference: { contains: '0107', mode: 'insensitive' } });
      expect(args.take).toBe(10);
      expect(result).toEqual([
        { id: BON_ID, reference: 'BMD-2026-0107', status: 'active', collaborateurName: 'Paul Durand', filialeName: 'livio-sud' },
      ]);
    });

    it('propose les bons les plus récents sans saisie', async () => {
      prisma.bon.findMany.mockResolvedValue([]);
      await service.searchBons(undefined);
      expect(prisma.bon.findMany.mock.calls[0][0].where).toEqual({ anonymizedAt: null });
    });

    it('borne la longueur de la saisie', async () => {
      prisma.bon.findMany.mockResolvedValue([]);
      await service.searchBons('x'.repeat(500));
      expect(prisma.bon.findMany.mock.calls[0][0].where.reference.contains).toHaveLength(50);
    });
  });

  describe('render', () => {
    it('rend le modèle avec le bon et un lien de signature factice', async () => {
      prisma.bon.findUnique.mockResolvedValue(dbBon());

      const result = await service.render('mise_disposition_request', BON_ID);

      expect(result.reference).toBe('BMD-2026-0107');
      expect(result.html).toContain('Paul Durand');
      expect(result.html).toContain(`https://bons.livio.fr/signer/${FAKE_SIGNATURE_TOKEN}`);
      expect(result.subject).toContain('BMD-2026-0107');
      expect(result.sampleVariables).toEqual([]);
    });

    it('ne lit jamais le jeton des signatures', async () => {
      prisma.bon.findUnique.mockResolvedValue(dbBon());
      await service.render('reminder', BON_ID);
      const select = prisma.bon.findUnique.mock.calls[0][0].select;
      expect(select.signatures.select).toEqual({ type: true, signed: true });
    });

    it("n'écrit rien en base", async () => {
      prisma.bon.findUnique.mockResolvedValue(dbBon());
      await service.render('restitution_request', BON_ID);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(prisma.signature.create).not.toHaveBeenCalled();
      expect(prisma.signature.update).not.toHaveBeenCalled();
      expect(prisma.bon.update).not.toHaveBeenCalled();
    });

    it('reprend la dernière contestation', async () => {
      prisma.bon.findUnique.mockResolvedValue(dbBon({
        contestations: [{ message: 'Écran différent', resolutionMessage: null, user: { displayName: 'Paul Durand', email: null } }],
      }));
      templatesService.renderTemplate.mockImplementation(async (_id: string, vars: Record<string, string>) => vars.CONTESTATION_MESSAGE);

      const result = await service.render('contestation_alert', BON_ID);

      expect(result.html).toBe('Écran différent');
      expect(result.sampleVariables).toEqual([]);
    });

    it('refuse un bon introuvable', async () => {
      prisma.bon.findUnique.mockResolvedValue(null);
      await expect(service.render('reminder', BON_ID)).rejects.toThrow(NotFoundException);
    });

    it('refuse un bon anonymisé', async () => {
      prisma.bon.findUnique.mockResolvedValue(dbBon({ anonymizedAt: new Date() }));
      await expect(service.render('reminder', BON_ID)).rejects.toThrow(BadRequestException);
      expect(templatesService.renderTemplate).not.toHaveBeenCalled();
    });

    it('refuse un modèle qui ne porte pas sur un bon', async () => {
      await expect(service.render('departure_alert', BON_ID)).rejects.toThrow(BadRequestException);
      expect(prisma.bon.findUnique).not.toHaveBeenCalled();
    });

    it('refuse un modèle inconnu', async () => {
      await expect(service.render('inconnu', BON_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
