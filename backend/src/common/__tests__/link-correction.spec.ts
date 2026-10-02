import { describe, expect, it } from 'vitest';
import { correctionBeforeNewLink, isResendOfSameDocument, type PreviousLinkWithChannel } from '../link-correction';

const link = (signed: boolean, invalidatedReason: Parameters<typeof correctionBeforeNewLink>[0][number]['invalidatedReason']) => ({
  signed,
  invalidatedReason,
});

describe('correctionBeforeNewLink — le nouveau lien suit-il une correction ?', () => {
  it('premier envoi : aucune correction', () => {
    expect(correctionBeforeNewLink([])).toBeNull();
  });

  it('lien précédent invalidé par une contestation Fondée → « contested »', () => {
    expect(correctionBeforeNewLink([link(false, 'contested')])).toBe('contested');
  });

  it('marquage corrigé, puis un renvoi ordinaire : la correction reste annoncée', () => {
    expect(correctionBeforeNewLink([link(false, 'replaced'), link(false, 'return_corrected')])).toBe('return_corrected');
  });

  it('bon modifié après envoi → « modified »', () => {
    expect(correctionBeforeNewLink([link(false, null), link(false, 'modified')])).toBe('modified');
  });

  it('une restitution signée entre-temps clôt le cycle : la correction d’avant ne compte plus', () => {
    expect(correctionBeforeNewLink([link(true, null), link(false, 'contested')])).toBeNull();
  });

  it('simple renvoi d’un lien expiré ou remplacé : demande ordinaire', () => {
    expect(correctionBeforeNewLink([link(false, 'replaced'), link(false, 'in_person')])).toBeNull();
  });
});

describe('isResendOfSameDocument', () => {
  const email = (over: Partial<PreviousLinkWithChannel> = {}): PreviousLinkWithChannel => ({
    signed: false, invalidatedReason: null, isInPerson: false, ...over,
  });

  it('aucun lien précédent : premier envoi', () => {
    expect(isResendOfSameDocument([])).toBe(false);
  });

  it('un lien déjà parti par email (valide, expiré ou remplacé) : renvoi', () => {
    expect(isResendOfSameDocument([email()])).toBe(true);
    expect(isResendOfSameDocument([email({ invalidatedReason: 'replaced' })])).toBe(true);
  });

  it('après une modification ou une correction : nouvel envoi de la nouvelle version', () => {
    expect(isResendOfSameDocument([email({ invalidatedReason: 'modified' })])).toBe(false);
    expect(isResendOfSameDocument([email({ invalidatedReason: 'return_corrected' }), email()])).toBe(false);
    expect(isResendOfSameDocument([email({ invalidatedReason: 'contested' })])).toBe(false);
  });

  it('le document précédent est signé (autre restitution) : premier envoi', () => {
    expect(isResendOfSameDocument([email({ signed: true })])).toBe(false);
  });

  it('un lien affiché au guichet ne compte pas comme un envoi', () => {
    expect(isResendOfSameDocument([email({ isInPerson: true, invalidatedReason: 'replaced' })])).toBe(false);
    expect(isResendOfSameDocument([email({ isInPerson: true, invalidatedReason: 'replaced' }), email({ invalidatedReason: 'in_person' })])).toBe(true);
  });
});
