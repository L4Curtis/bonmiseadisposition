import { Logger } from '@nestjs/common';
import type { SignatureSignedEvent } from '../../../common/events';
import { createMockPrismaService, type MockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import type { FactsBon } from '../bon-facts';
import { afterCollaboratorSignature } from '../bon-after-signature';
import { emitPvClotureIfDue } from '../bon-cloture';
import { closeReplacedOriginal } from '../bon-replacement';
import type { BonsWorkflowContext } from '../bon-context';

// Les deux suites lourdes (PV, clôture du bon remplacé) ont leurs propres
// tests sur vraie base (test/contract/lifecycle) : ici, on vérifie quand
// elles sont déclenchées, et l'arrêt de l'horloge d'attente.
vi.mock('../bon-cloture', () => ({ emitPvClotureIfDue: vi.fn() }));
vi.mock('../bon-replacement', () => ({ closeReplacedOriginal: vi.fn() }));

const emitPv = vi.mocked(emitPvClotureIfDue);
const closeOriginal = vi.mocked(closeReplacedOriginal);

function signed(overrides: Partial<SignatureSignedEvent>): SignatureSignedEvent {
  return {
    bonId: 'bon-1',
    bonReference: 'BON-2026-0001',
    actorId: null,
    occurredAt: new Date('2026-09-25T10:00:00Z'),
    signatureId: 'sig-1',
    documentType: 'mise_disposition',
    previousStatus: 'sent_mise_dispo',
    newStatus: 'active',
    signerEmail: 'lea.martin@groupe.fr',
    inPerson: false,
    signedByProxy: false,
    ...overrides,
  };
}

/** Bon relu après la signature : faits + horloge d'attente. */
function reloaded(bon: Partial<FactsBon>, awaitingSince: Date | null) {
  return {
    status: 'active',
    collaborateur: { active: true, email: 'lea.martin@groupe.fr' },
    equipments: [{ returnedAt: null, notReturned: false }],
    signatures: [],
    awaitingSince,
    ...bon,
  };
}

describe('suites d’une signature du collaborateur', () => {
  let prisma: MockPrismaService;
  let ctx: BonsWorkflowContext;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrismaService();
    prisma.bon.update.mockResolvedValue({ id: 'bon-1' });
    emitPv.mockResolvedValue(false);
    closeOriginal.mockResolvedValue(undefined);
    const logger = new Logger('test');
    vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    ctx = { prisma, logger } as unknown as BonsWorkflowContext;
  });

  it('remise signée : l’horloge s’arrête et l’original d’un bon remplaçant est clôturé', async () => {
    prisma.bon.findUnique.mockResolvedValue(reloaded({ status: 'active' }, new Date('2026-09-20T00:00:00Z')));
    await afterCollaboratorSignature(ctx, signed({}));

    expect(prisma.bon.update).toHaveBeenCalledWith({ where: { id: 'bon-1' }, data: { awaitingSince: null }, select: { id: true } });
    expect(closeOriginal).toHaveBeenCalledWith(ctx, 'bon-1');
    expect(emitPv).not.toHaveBeenCalled();
  });

  it('restitution signée alors qu’un équipement manque : le PV de non-restitution part s’il est dû', async () => {
    emitPv.mockResolvedValue(true);
    // Tout est signé, un équipement est déclaré non restitué : le PV attend désormais.
    prisma.bon.findUnique.mockResolvedValue(
      reloaded({ status: 'partially_returned', equipments: [{ returnedAt: null, notReturned: true }] }, new Date()),
    );
    await afterCollaboratorSignature(
      ctx,
      signed({ documentType: 'restitution', previousStatus: 'sent_restitution', newStatus: 'partially_returned' }),
    );

    expect(emitPv).toHaveBeenCalledWith(ctx, 'bon-1', undefined, null);
    expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining('PV de non-restitution émis'));
    // Le PV attend la signature : l'horloge continue.
    expect(prisma.bon.update).not.toHaveBeenCalled();
    expect(closeOriginal).not.toHaveBeenCalled();
  });

  it('restitution complète signée : ni PV ni remplacement, l’horloge s’arrête', async () => {
    prisma.bon.findUnique.mockResolvedValue(
      reloaded({ status: 'archived', equipments: [{ returnedAt: new Date('2026-09-24T00:00:00Z'), notReturned: false }] }, new Date()),
    );
    await afterCollaboratorSignature(ctx, signed({ documentType: 'restitution', previousStatus: 'sent_restitution', newStatus: 'archived' }));

    expect(emitPv).not.toHaveBeenCalled();
    expect(prisma.bon.update).toHaveBeenCalledTimes(1);
    expect(closeOriginal).not.toHaveBeenCalled();
  });

  it('événement rejoué sur un bon dont l’horloge est déjà arrêtée : aucune écriture', async () => {
    prisma.bon.findUnique.mockResolvedValue(reloaded({ status: 'archived' }, null));
    await afterCollaboratorSignature(ctx, signed({ documentType: 'pv_cloture', newStatus: 'archived' }));
    expect(prisma.bon.update).not.toHaveBeenCalled();
  });
});
