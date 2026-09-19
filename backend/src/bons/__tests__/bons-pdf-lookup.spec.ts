import { BadRequestException } from '@nestjs/common';
import { assertValidPdfQuery, resolveBonPdf } from '../bons-pdf-lookup';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

describe('assertValidPdfQuery', () => {
  it("accepte un type et une étape valides (cas nominal)", () => {
    expect(() => assertValidPdfQuery('restitution', 'signature_collab_restitution')).not.toThrow();
  });

  it('rejette un type inconnu', () => {
    expect(() => assertValidPdfQuery('inconnu')).toThrow(BadRequestException);
  });

  it('rejette une étape (stage) inconnue', () => {
    expect(() => assertValidPdfQuery('mise_disposition', 'etape_inexistante')).toThrow(BadRequestException);
  });

  it('accepte une étape absente (cas limite : stage optionnel)', () => {
    expect(() => assertValidPdfQuery('mise_disposition', undefined)).not.toThrow();
  });
});

describe('resolveBonPdf', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  const bon = { id: 'bon-1', reference: 'BMD-2026-0042' };

  beforeEach(() => {
    prisma = createMockPrismaService();
  });

  it("sert le snapshot de l'étape demandée en priorité quand stage est fourni (cas nominal)", async () => {
    (prisma.pdfSnapshot.findUnique as jest.Mock).mockResolvedValue({
      filename: 'etape.pdf',
      data: Buffer.from('etape'),
    });

    const result = await resolveBonPdf(prisma as never, bon, 'mise_disposition', 'signature_it_cachet');

    expect(result).toEqual({ filename: 'etape.pdf', data: Buffer.from('etape') });
  });

  it('retombe sur le snapshot par défaut du type quand le stage demandé est absent', async () => {
    (prisma.pdfSnapshot.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // stage
      .mockResolvedValueOnce({ filename: 'defaut.pdf', data: Buffer.from('defaut') }); // type par défaut

    const result = await resolveBonPdf(prisma as never, bon, 'mise_disposition', 'etape-absente');

    expect(result).toEqual({ filename: 'defaut.pdf', data: Buffer.from('defaut') });
  });

  it('retombe sur les colonnes legacy quand aucun PdfSnapshot n’existe', async () => {
    (prisma.pdfSnapshot.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.bon.findUnique as jest.Mock).mockResolvedValue({
      pdfMiseDispoSnapshot: Buffer.from('legacy'),
      pdfRestitutionSnapshot: null,
    });

    const result = await resolveBonPdf(prisma as never, bon, 'mise_disposition');

    expect(result).toEqual({ filename: 'bon-BMD-2026-0042.pdf', data: Buffer.from('legacy') });
  });

  it("renvoie null quand rien n'est stocké (cas limite : génération à la volée déléguée au contrôleur)", async () => {
    (prisma.pdfSnapshot.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.bon.findUnique as jest.Mock).mockResolvedValue({
      pdfMiseDispoSnapshot: null,
      pdfRestitutionSnapshot: null,
    });

    const result = await resolveBonPdf(prisma as never, bon, 'restitution');

    expect(result).toBeNull();
  });
});
