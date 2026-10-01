import { describe, expect, it } from 'vitest';
import { correctionBeforeNewLink } from '../link-correction';

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
