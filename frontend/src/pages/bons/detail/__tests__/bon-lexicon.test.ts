import { describe, expect, it } from 'vitest';
import { actionLabel } from '../bon-lexicon';

const pending = { type: 'restitution' as const, expired: true, inPerson: false, itSigned: false, expiresAt: null };

describe('actionLabel', () => {
  it('premier lien d’un document (aucun envoi encore) : « Envoyer », pas « Renvoyer »', () => {
    expect(actionLabel('resend', { pendingSignature: { ...pending, sentAt: null } })).toBe('Envoyer le lien par email');
  });

  it('un lien est déjà parti : « Renvoyer le lien »', () => {
    expect(actionLabel('resend', { pendingSignature: { ...pending, sentAt: '2026-09-20T08:00:00.000Z' } }))
      .toBe('Renvoyer le lien');
    expect(actionLabel('cancel', { pendingSignature: null })).toBe('Annuler le bon');
  });
});
