import { loadSignedDocumentAttachment } from '../notification-data';

/** PDF joint à la confirmation de signature : le plus récent de son type,
 *  sous un nom lisible par le collaborateur (jamais le nom technique du type). */
describe('loadSignedDocumentAttachment', () => {
  function prismaWith(snapshot: unknown) {
    return { pdfSnapshot: { findFirst: vi.fn().mockResolvedValue(snapshot) } };
  }

  it('PV signé : nom lisible et daté, document le plus récent', async () => {
    const prisma = prismaWith({
      data: Buffer.from('%PDF'),
      createdAt: new Date('2026-09-27T13:03:27Z'),
      bon: { reference: 'BON-2026-0074' },
    });

    const attachment = await loadSignedDocumentAttachment(prisma as never, 'bon-1', 'pv_cloture');

    expect(attachment?.filename).toBe('BON-2026-0074_PV-de-non-restitution-signe_2026-09-27_15h03.pdf');
    expect(attachment?.filename).not.toMatch(/cloture_equipements|signature_collab/);
    expect(prisma.pdfSnapshot.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { bonId: 'bon-1', type: 'cloture_equipements_manquants' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('restitution signée : « Bon-de-restitution-signe »', async () => {
    const prisma = prismaWith({ data: Buffer.from('%PDF'), createdAt: new Date('2026-09-27T22:30:00Z'), bon: { reference: 'BON-1' } });
    const attachment = await loadSignedDocumentAttachment(prisma as never, 'bon-1', 'restitution');
    // 22 h 30 UTC = 0 h 30 le lendemain à Paris : date et heure sont celles de Paris.
    expect(attachment?.filename).toBe('BON-1_Bon-de-restitution-signe_2026-09-28_00h30.pdf');
  });

  it('aucun document signé : pas de pièce jointe', async () => {
    expect(await loadSignedDocumentAttachment(prismaWith(null) as never, 'bon-1', 'mise_disposition')).toBeNull();
  });
});
