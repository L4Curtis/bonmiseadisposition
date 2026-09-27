import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { requestNewLink, LINK_REQUEST_AUDIT_ACTION } from '../link-request';
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
  };
  const alertIt = vi.fn().mockResolvedValue(undefined);
  return { prisma, alertIt, deps: { prisma: prisma as never, alertIt } };
}

const LEA = { email: 'lea@livio.fr', id: 'user-lea' };

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

  it('limite de débit : une demande par bon et par 24 h, sans nouvel email', async () => {
    const earlier = new Date(Date.now() - 2 * HOUR);
    const { deps, alertIt } = makeDeps(expiredLink(), earlier);
    const result = await requestNewLink(deps, 'tok', LEA);
    expect(result).toEqual({ ok: true, status: 'already_requested', requestedAt: earlier });
    expect(alertIt).not.toHaveBeenCalled();
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
