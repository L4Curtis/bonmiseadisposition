import { describe, expect, it } from 'vitest';
import { signatureAuthor, type SignatureAuditInput } from '../signature-audit';

const base: SignatureAuditInput = {
  bon: { id: 'bon-1', collaborateurId: 'lea', collaborateurEmail: 'lea@test.fr', collaborateur: { displayName: 'Léa Martin' } },
  documentType: 'restitution',
  isInPerson: false,
  signedByProxy: false,
  collectedByOtherAccount: false,
  account: { id: 'lea', email: 'lea@test.fr', ip: '127.0.0.1', userAgent: 'test' },
  mentionLuApprouve: true,
  previousStatus: 'sent_restitution',
  newStatus: 'archived',
};

describe('signatureAuthor — qui a signé, d’après la signature', () => {
  it('à distance : le titulaire, sans précision', () => {
    expect(signatureAuthor(base, 'Léa Martin')).toEqual({ actorId: 'lea', actorEmail: 'lea@test.fr', inPersonContext: null });
  });

  it('au guichet sur son propre compte : le titulaire, « au guichet »', () => {
    expect(signatureAuthor({ ...base, isInPerson: true }, 'Léa Martin').inPersonContext).toBe('au guichet');
  });

  it('au guichet sur le compte du technicien : le titulaire, en présence du technicien', () => {
    const author = signatureAuthor(
      { ...base, isInPerson: true, collectedByOtherAccount: true, account: { ...base.account, id: 'julie', email: 'julie@test.fr' } },
      'Julie Moreau',
    );
    expect(author).toEqual({ actorId: 'lea', actorEmail: 'lea@test.fr', inPersonContext: 'au guichet, en présence de Julie Moreau' });
  });

  it('par un mandataire : le mandataire, pour le compte du titulaire', () => {
    const author = signatureAuthor(
      { ...base, isInPerson: true, collectedByOtherAccount: true, signedByProxy: true, account: { ...base.account, id: 'marc', email: 'marc@test.fr' } },
      'marc@test.fr',
    );
    expect(author).toEqual({ actorId: 'marc', actorEmail: 'marc@test.fr', inPersonContext: 'au guichet, pour le compte de Léa Martin (mandataire)' });
  });
});
