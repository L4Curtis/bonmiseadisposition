import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { attachNewLinkRequests, requestNewLink, LINK_REQUEST_AUDIT_ACTION } from '../link-request';
import { itCachetDocument, pvContextDocument } from '../it-cachet';

/** « Demander un nouveau lien » depuis un lien expiré (R-058). */

const HOUR = 60 * 60 * 1000;

function expiredLink(overrides: Record<string, unknown> = {}) {
  return {
    type: 'restitution',
    signed: false,
    isInPerson: false,
    tokenExpiresAt: new Date(Date.now() - HOUR),
    invalidatedReason: null,
    createdAt: new Date(Date.now() - 8 * 24 * HOUR),
    bon: { id: 'bon-1', status: 'sent_restitution', collaborateurId: 'user-lea', collaborateurEmail: 'lea@livio.fr' },
    ...overrides,
  };
}

function makeDeps(link: unknown, lastRequest: Date | null = null) {
  const prisma = {
    signature: { findUnique: vi.fn().mockResolvedValue(link) },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(lastRequest ? { createdAt: lastRequest } : null),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ ...prisma, $executeRaw: vi.fn() }));
  const alertIt = vi.fn().mockResolvedValue(undefined);
  return { prisma, alertIt, deps: { prisma: prisma as never, alertIt } };
}

const LEA = { email: 'lea@livio.fr', id: 'user-lea' };

/** Base simulée dont le verrou de bon (`pg_advisory_xact_lock`) fait
 *  vraiment attendre la transaction suivante jusqu'à la fin de la première. */
function makeLockingDeps(link: unknown) {
  const rows: { createdAt: Date }[] = [];
  let tail: Promise<void> = Promise.resolve();
  const prisma = {
    signature: { findUnique: vi.fn().mockResolvedValue(link) },
    auditLog: {
      findFirst: vi.fn(async () => rows[0] ?? null),
      create: vi.fn(async ({ data }: { data: { createdAt: Date } }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        rows.push({ createdAt: data.createdAt });
        return {};
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let release: () => void = () => undefined;
      const tx = {
        ...prisma,
        $executeRaw: vi.fn(async () => {
          const previous = tail;
          tail = new Promise<void>((resolve) => { release = resolve; });
          await previous;
        }),
      };
      try {
        return await fn(tx);
      } finally {
        release();
      }
    }),
  };
  const alertIt = vi.fn();
  return { alertIt, deps: { prisma: prisma as never, alertIt } };
}

describe('requestNewLink', () => {
  it('prévient l’IT et trace la demande', async () => {
    const { deps, alertIt, prisma } = makeDeps(expiredLink());
    const result = await requestNewLink(deps, 'tok', LEA);
    expect(result.status).toBe('requested');
    expect(alertIt).toHaveBeenCalledWith(expect.objectContaining({ bonId: 'bon-1', documentType: 'restitution', requesterEmail: 'lea@livio.fr' }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: LINK_REQUEST_AUDIT_ACTION, bonId: 'bon-1' }) }),
    );
  });

  it('deux demandes simultanées : une seule alerte à l’IT (demande sérialisée par bon)', async () => {
    const { deps, alertIt } = makeLockingDeps(expiredLink());
    const results = await Promise.all([requestNewLink(deps, 'tok', LEA), requestNewLink(deps, 'tok', LEA)]);
    expect(results.map((r) => r.status).sort()).toEqual(['already_requested', 'requested']);
    expect(alertIt).toHaveBeenCalledTimes(1);
  });

  it('une seule alerte par lien en attente, même des jours après : « déjà demandé », sans nouvel email', async () => {
    const earlier = new Date(Date.now() - 3 * 24 * HOUR);
    const link = expiredLink();
    const { deps, alertIt, prisma } = makeDeps(link, earlier);
    const result = await requestNewLink(deps, 'tok', LEA);
    expect(result).toEqual({ ok: true, status: 'already_requested', requestedAt: earlier });
    expect(alertIt).not.toHaveBeenCalled();
    // Demandes comptées depuis l’émission de CE lien : un lien renvoyé par
    // l’IT (nouvelle signature) permet une nouvelle demande.
    expect(prisma.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: link.createdAt } }),
    }));
  });

  it('refuse un autre compte, sans révéler l’adresse du destinataire', async () => {
    const { deps } = makeDeps(expiredLink());
    const error = await requestNewLink(deps, 'tok', { email: 'hugo@livio.fr', id: 'user-hugo' }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).not.toContain('lea@');
  });

  it('refuse un lien encore valable', async () => {
    const { deps } = makeDeps(expiredLink({ tokenExpiresAt: new Date(Date.now() + HOUR) }));
    await expect(requestNewLink(deps, 'tok', LEA)).rejects.toThrow('encore valable');
  });

  it('lien invalidé : dit le vrai motif au lieu d’alerter', async () => {
    const { deps, alertIt } = makeDeps(expiredLink({ tokenExpiresAt: new Date(0), invalidatedReason: 'in_person' }));
    await expect(requestNewLink(deps, 'tok', LEA)).rejects.toThrow('guichet');
    expect(alertIt).not.toHaveBeenCalled();
  });

  it('bon clôturé : plus rien à signer', async () => {
    const { deps } = makeDeps(expiredLink({ bon: { ...expiredLink().bon, status: 'archived' } }));
    await expect(requestNewLink(deps, 'tok', LEA)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('document d’une signature IT (pdfType)', () => {
  it.each([
    ['draft', 'mise_disposition'],
    ['sent_mise_dispo', 'mise_disposition'],
    ['active', 'restitution'],
    ['partially_returned', 'restitution'],
  ])('signature IT sans document précisé, bon %s → %s', (status, expected) => {
    expect(itCachetDocument(undefined, status)).toBe(expected);
  });

  it('le document demandé par l’écran fait foi', () => {
    expect(itCachetDocument('mise_disposition', 'active')).toBe('mise_disposition');
  });

  it.each([
    ['archived', 'avenant'],
    // Restitution à signer : la déclaration signe le PV qui suivra.
    ['sent_restitution', 'pv_cloture'],
    ['partially_returned', 'pv_cloture'],
  ])('signature IT d’une déclaration ou d’un équipement retrouvé, bon %s → %s', (status, expected) => {
    expect(pvContextDocument(status)).toBe(expected);
  });
});

describe('attachNewLinkRequests — « Nouveau lien demandé le … » dans le portail', () => {
  const bon = (id: string, sentAt: string | null) => ({ id, pendingSignature: sentAt === null ? null : { sentAt } });

  it('date de la demande faite depuis l’envoi du dernier lien ; rien pour une demande antérieure au renvoi', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { bonId: 'b1', createdAt: new Date('2026-09-27T10:00:00Z') },
      { bonId: 'b2', createdAt: new Date('2026-09-20T10:00:00Z') },
    ]);
    const prisma = { auditLog: { findMany } } as never;
    const [b1, b2, b3] = await attachNewLinkRequests(prisma, [
      bon('b1', '2026-09-20T08:00:00.000Z'),
      bon('b2', '2026-09-25T08:00:00.000Z'), // renvoyé par l’IT après la demande
      bon('b3', null),
    ]);
    expect(b1.pendingSignature).toMatchObject({ newLinkRequestedAt: '2026-09-27T10:00:00.000Z' });
    expect(b2.pendingSignature).toMatchObject({ newLinkRequestedAt: null });
    expect(b3.pendingSignature).toBeNull();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bonId: { in: ['b1', 'b2'] }, action: LINK_REQUEST_AUDIT_ACTION },
    }));
  });
});
