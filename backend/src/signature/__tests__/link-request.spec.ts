import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { attachNewLinkRequests, requestNewLink, LINK_REQUEST_AUDIT_ACTION } from '../link-request';
import { itCachetDocument, pvContextDocument } from '../it-cachet';

/** « Demander un nouveau lien » depuis un lien expiré (R-058). */

const HOUR = 60 * 60 * 1000;

function expiredLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sig-1',
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

/** Demande déjà tracée dans le journal, pour le lien expiré `signatureId`. */
function recorded(createdAt: Date, signatureId?: string) {
  return { createdAt, details: { documentType: 'restitution', ...(signatureId ? { signatureId } : {}) } };
}

function makeDeps(link: unknown, requests: ReturnType<typeof recorded>[] = []) {
  const prisma = {
    signature: { findUnique: vi.fn().mockResolvedValue(link) },
    auditLog: {
      findMany: vi.fn().mockResolvedValue(requests),
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
  const rows: ReturnType<typeof recorded>[] = [];
  let tail: Promise<void> = Promise.resolve();
  const prisma = {
    signature: { findUnique: vi.fn().mockResolvedValue(link) },
    auditLog: {
      findMany: vi.fn(async () => [...rows]),
      create: vi.fn(async ({ data }: { data: { details: { signatureId: string } } }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        rows.push(recorded(new Date(), data.details.signatureId));
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
  it('prévient l’IT et trace la demande, avec l’identifiant du lien expiré', async () => {
    const { deps, alertIt, prisma } = makeDeps(expiredLink());
    const result = await requestNewLink(deps, 'tok', LEA);
    expect(result.status).toBe('requested');
    expect(alertIt).toHaveBeenCalledWith(expect.objectContaining({ bonId: 'bon-1', documentType: 'restitution', requesterEmail: 'lea@livio.fr' }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: LINK_REQUEST_AUDIT_ACTION,
        bonId: 'bon-1',
        userId: 'user-lea',
        userEmail: 'lea@livio.fr',
        details: expect.objectContaining({ documentType: 'restitution', signatureId: 'sig-1' }),
      }),
    });
  });

  it('deux demandes simultanées : une seule alerte à l’IT (demande sérialisée par bon)', async () => {
    const { deps, alertIt } = makeLockingDeps(expiredLink());
    const results = await Promise.all([requestNewLink(deps, 'tok', LEA), requestNewLink(deps, 'tok', LEA)]);
    expect(results.map((r) => r.status).sort()).toEqual(['already_requested', 'requested']);
    expect(alertIt).toHaveBeenCalledTimes(1);
  });

  it('une seule alerte par lien en attente, même des jours après : « déjà demandé », sans nouvel email', async () => {
    const earlier = new Date(Date.now() - 3 * 24 * HOUR);
    const { deps, alertIt, prisma } = makeDeps(expiredLink(), [recorded(earlier, 'sig-1')]);
    const result = await requestNewLink(deps, 'tok', LEA);
    expect(result).toEqual({ ok: true, status: 'already_requested', requestedAt: earlier });
    expect(alertIt).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('une demande faite pour un lien précédent n’empêche pas de redemander pour le lien renvoyé', async () => {
    // Datée APRÈS l’émission du lien (horloges décalées) : seul l’identifiant compte.
    const { deps, alertIt } = makeDeps(expiredLink(), [recorded(new Date(), 'sig-0')]);
    const result = await requestNewLink(deps, 'tok', LEA);
    expect(result.status).toBe('requested');
    expect(alertIt).toHaveBeenCalledTimes(1);
  });

  it('demande enregistrée avant l’identifiant du lien : reconnue par sa date', async () => {
    const earlier = new Date(Date.now() - 3 * 24 * HOUR);
    const { deps } = makeDeps(expiredLink(), [recorded(earlier)]);
    expect((await requestNewLink(deps, 'tok', LEA)).status).toBe('already_requested');
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

describe('demande, renvoi, nouvelle demande — journal partagé entre les étapes', () => {
  /** Base simulée qui garde réellement les demandes écrites : chaque étape
   *  relit ce que la précédente a enregistré. `links` = liens par jeton. */
  function statefulDeps(links: Record<string, ReturnType<typeof expiredLink>>) {
    const rows: ReturnType<typeof recorded>[] = [];
    const prisma = {
      signature: { findUnique: vi.fn(async ({ where }: { where: { token: string } }) => links[where.token] ?? null) },
      auditLog: {
        findMany: vi.fn(async () => [...rows].reverse()),
        create: vi.fn(async ({ data }: { data: { details: { signatureId: string } } }) => {
          rows.push(recorded(new Date(), data.details.signatureId));
          return {};
        }),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ ...prisma, $executeRaw: vi.fn() }));
    const alertIt = vi.fn();
    return { rows, alertIt, deps: { prisma: prisma as never, alertIt } };
  }

  it('une alerte par lien : la demande sur le lien renvoyé alerte de nouveau, sa répétition non', async () => {
    // Le lien renvoyé est émis APRÈS la première demande, mais l’horloge du
    // journal a pris de l’avance : seule la comparaison par identifiant tient.
    const first = expiredLink({ id: 'sig-1', createdAt: new Date(Date.now() - 10 * 24 * HOUR) });
    const resent = expiredLink({ id: 'sig-2', createdAt: new Date(Date.now() - 2 * HOUR) });
    const { rows, alertIt, deps } = statefulDeps({ old: first, fresh: resent });

    expect((await requestNewLink(deps, 'old', LEA)).status).toBe('requested');
    expect((await requestNewLink(deps, 'old', LEA)).status).toBe('already_requested');
    rows[0] = recorded(new Date(Date.now() + HOUR), 'sig-1');

    expect((await requestNewLink(deps, 'fresh', LEA)).status).toBe('requested');
    expect((await requestNewLink(deps, 'fresh', LEA)).status).toBe('already_requested');
    expect(alertIt).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => (r.details as { signatureId: string }).signatureId)).toEqual(['sig-1', 'sig-2']);
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
  const sig = (id: string, createdAt: string) => ({ id, type: 'restitution', signed: false, createdAt });
  const bon = (id: string, signatures: ReturnType<typeof sig>[]) => ({
    id,
    signatures,
    pendingSignature: signatures.length === 0 ? null : { type: 'restitution' as const, sentAt: signatures[signatures.length - 1].createdAt },
  });

  it('date de la demande qui vise le dernier lien ; rien pour une demande faite avant le renvoi', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { bonId: 'b1', createdAt: new Date('2026-09-27T10:00:00Z'), details: { signatureId: 's1' } },
      // Demande pour le premier lien de b2, datée après le renvoi (horloges décalées).
      { bonId: 'b2', createdAt: new Date('2026-09-26T10:00:00Z'), details: { signatureId: 's2' } },
    ]);
    const prisma = { auditLog: { findMany } } as never;
    const [b1, b2, b3] = await attachNewLinkRequests(prisma, [
      bon('b1', [sig('s1', '2026-09-20T08:00:00.000Z')]),
      bon('b2', [sig('s2', '2026-09-20T08:00:00.000Z'), sig('s3', '2026-09-27T08:00:00.000Z')]),
      bon('b3', []),
    ]);
    expect(b1.pendingSignature).toMatchObject({ newLinkRequestedAt: '2026-09-27T10:00:00.000Z' });
    expect(b2.pendingSignature).toMatchObject({ newLinkRequestedAt: null });
    expect(b3.pendingSignature).toBeNull();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bonId: { in: ['b1', 'b2'] }, action: LINK_REQUEST_AUDIT_ACTION },
    }));
  });
});
