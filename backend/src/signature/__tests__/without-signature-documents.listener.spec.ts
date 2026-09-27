import { Test } from '@nestjs/testing';
import { DomainEventsModule, DomainEventsPublisher, DOMAIN_EVENTS } from '../../common/events';
import { createMockPrismaService, type MockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockPdfService, createMockSmbService } from '../../common/__tests__/helpers/mock-services';
import { PdfService } from '../../pdf/pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SmbService } from '../../smb/smb.service';
import { WithoutSignatureDocumentsListener } from '../without-signature-documents.listener';

/**
 * Les deux gestes « sans signature » produisent leur document probant
 * (R-031). Test sur le vrai bus d'événements : l'écouteur est bien abonné aux
 * deux événements, et une panne n'est jamais renvoyée à l'émetteur.
 */
describe('WithoutSignatureDocumentsListener', () => {
  const OCCURRED_AT = new Date('2026-09-25T14:30:00Z');
  const base = { bonId: 'bon-1', bonReference: 'BON-2026-0001', actorId: 'tech-1', occurredAt: OCCURRED_AT };
  const bonRow = { id: 'bon-1', reference: 'BON-2026-0001', collaborateur: { displayName: 'Léa Martin' } };

  let prisma: MockPrismaService;
  let pdfService: ReturnType<typeof createMockPdfService>;
  let smbService: ReturnType<typeof createMockSmbService>;
  let publisher: DomainEventsPublisher;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    pdfService = createMockPdfService();
    smbService = createMockSmbService();
    prisma.pdfSnapshot.findFirst.mockResolvedValue(null);
    prisma.bon.findUniqueOrThrow.mockResolvedValue(bonRow);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Marie Martin' });
    prisma.auditLog.create.mockResolvedValue({});

    const module = await Test.createTestingModule({
      imports: [DomainEventsModule],
      providers: [
        WithoutSignatureDocumentsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: pdfService },
        { provide: SmbService, useValue: smbService },
      ],
    }).compile();
    await module.init();
    publisher = module.get(DomainEventsPublisher);
  });

  it('remise sans signature → document « remise_sans_signature » avec le motif et le technicien', async () => {
    await publisher.publish(DOMAIN_EVENTS.bonHandoverWithoutSignature, { ...base, reason: 'Collaborateur sur chantier' });

    expect(pdfService.saveDocument).toHaveBeenCalledTimes(1);
    const [bon, type, filename] = pdfService.saveDocument.mock.calls[0];
    expect(type).toBe('remise_sans_signature');
    expect(filename).toMatch(/^BON-2026-0001_Lea-Martin_Remise-constatee-sans-signature_2026-09-\d{2}_\d{2}h\d{2}m\d{2}\.pdf$/);
    expect(bon._withoutSignature).toEqual({
      kind: 'handover',
      reason: 'Collaborateur sur chantier',
      actorName: 'Marie Martin',
      at: OCCURRED_AT,
    });
    expect(smbService.exportPdf).toHaveBeenCalledWith(expect.objectContaining({ id: 'bon-1' }), filename, expect.any(Buffer));
  });

  it('clôture sans signature par une tâche automatique → document signé « l’équipe informatique »', async () => {
    await publisher.publish(DOMAIN_EVENTS.bonClosedWithoutSignature, {
      ...base, actorId: null, previousStatus: 'sent_restitution', reason: 'Départ sans restitution',
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    const [bon, type] = pdfService.saveDocument.mock.calls[0];
    expect(type).toBe('cloture_sans_signature');
    expect(bon._withoutSignature).toMatchObject({ kind: 'closure', actorName: "l'équipe informatique" });
  });

  it('événement rejoué : un document déjà produit n’est pas refait', async () => {
    prisma.pdfSnapshot.findFirst.mockResolvedValue({ id: 'snap-1' });
    await publisher.publish(DOMAIN_EVENTS.bonHandoverWithoutSignature, { ...base, reason: 'Collaborateur sur chantier' });

    expect(prisma.pdfSnapshot.findFirst).toHaveBeenCalledWith({
      where: { bonId: 'bon-1', type: 'remise_sans_signature' },
      select: { id: true },
    });
    expect(pdfService.saveDocument).not.toHaveBeenCalled();
  });

  it('échec de génération : tracé dans l’audit pour être régénéré, sans remonter à l’émetteur', async () => {
    pdfService.saveDocument.mockRejectedValue(new Error('disque plein'));
    await expect(
      publisher.publish(DOMAIN_EVENTS.bonHandoverWithoutSignature, { ...base, reason: 'Collaborateur sur chantier' }),
    ).resolves.toBeUndefined();

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { bonId: 'bon-1', action: 'pdf_snapshot_failed', details: { type: 'remise_sans_signature', error: 'disque plein' } },
    });
    expect(smbService.exportPdf).not.toHaveBeenCalled();
  });
});
