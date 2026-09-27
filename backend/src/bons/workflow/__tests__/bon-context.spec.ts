import { Logger } from '@nestjs/common';
import { createMockPrismaService, type MockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService, createMockPdfService } from '../../../common/__tests__/helpers/mock-services';
import type { BonForPdf } from '../../../pdf/pdf.service';
import { BonsWorkflowContext, generateAndSaveSnapshot, getPvTokenValidityDays } from '../bon-context';

function context(prisma: MockPrismaService, overrides: Partial<Record<'pdfService' | 'configService', unknown>> = {}) {
  const logger = new Logger('test');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  const ctx = {
    prisma,
    pdfService: createMockPdfService(),
    configService: createMockConfigService(),
    logger,
    ...overrides,
  };
  return ctx as unknown as BonsWorkflowContext & { pdfService: ReturnType<typeof createMockPdfService> };
}

const BON = { id: 'bon-1', reference: 'BON-2026-0001' } as unknown as BonForPdf;

describe('document PDF produit après une action déjà validée', () => {
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('renvoie le PDF produit', async () => {
    const ctx = context(prisma);
    const pdf = await generateAndSaveSnapshot(ctx, 'bon-1', BON, 'mise_disposition', null, 'bon.pdf');
    expect(pdf).toEqual(Buffer.from('mock-pdf'));
    expect(ctx.pdfService.generateAndSave).toHaveBeenCalledWith(BON, 'mise_disposition', null, 'bon.pdf');
  });

  it('un échec ne fait pas échouer l’action : null, erreur journalisée et tracée pour régénération', async () => {
    const ctx = context(prisma);
    ctx.pdfService.generateAndSave.mockRejectedValue(new Error('police introuvable'));

    await expect(generateAndSaveSnapshot(ctx, 'bon-1', BON, 'restitution', null, 'bon.pdf')).resolves.toBeNull();
    expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('[restitution] pour le bon bon-1'));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { bonId: 'bon-1', action: 'pdf_snapshot_failed', details: { type: 'restitution', error: 'police introuvable' } },
    });
  });

  it('même la trace d’audit en échec ne remonte pas à l’appelant', async () => {
    const ctx = context(prisma);
    ctx.pdfService.generateAndSave.mockRejectedValue('panne');
    prisma.auditLog.create.mockRejectedValue(new Error('base indisponible'));

    await expect(generateAndSaveSnapshot(ctx, 'bon-1', BON, 'pv_cloture', null, 'pv.pdf')).resolves.toBeNull();
    expect(prisma.auditLog.create.mock.calls[0][0].data.details).toEqual({ type: 'pv_cloture', error: 'panne' });
  });
});

describe('validité du lien du PV de non-restitution', () => {
  async function validityFor(stored: string | null): Promise<number> {
    const configService = createMockConfigService();
    if (stored !== null) await configService.set('tokens', 'expiry_days', stored);
    return getPvTokenValidityDays(context(createMockPrismaService(), { configService }));
  }

  it('suit le réglage « durée des liens » de l’administration', async () => {
    expect(await validityFor('14')).toBe(14);
  });

  it('7 jours sans réglage ou avec un réglage illisible', async () => {
    expect(await validityFor(null)).toBe(7);
    expect(await validityFor('quinze')).toBe(7);
  });

  it('borné entre 1 et 30 jours', async () => {
    expect(await validityFor('0')).toBe(1);
    expect(await validityFor('-3')).toBe(1);
    expect(await validityFor('90')).toBe(30);
  });
});
