import { describe, expect, it } from 'vitest';
import { closedBonScreen, invalidatedLinkScreen } from '../link-screens';

describe('écran d’un lien invalidé : le vrai motif (R-038)', () => {
  it('bon clôturé sans signature : « Ce bon a été clôturé », pas de nouveau lien annoncé', () => {
    const screen = invalidatedLinkScreen('closed_without_signature');
    expect(screen.title).toBe('Bon clôturé');
    expect(screen.message).toMatch(/clôturé/);
    expect(screen.message).not.toMatch(/nouveau lien/);
  });

  it('passage au guichet : l’écran le dit', () => {
    expect(invalidatedLinkScreen('in_person').title).toBe('Signature au guichet');
    expect(invalidatedLinkScreen('in_person').message).toMatch(/guichet/);
  });

  it('bon modifié, annulé, remise sans signature : chacun son écran', () => {
    expect(invalidatedLinkScreen('modified').title).toBe('Bon modifié');
    expect(invalidatedLinkScreen('cancelled').message).toMatch(/annulé/);
    expect(invalidatedLinkScreen('handover_without_signature').message).not.toMatch(/nouveau lien/);
  });

  it('motif inconnu : message neutre, sans promesse d’un nouveau lien', () => {
    for (const reason of [null, undefined]) {
      const screen = invalidatedLinkScreen(reason);
      expect(screen.title).toBe('Lien plus valable');
      expect(screen.message).not.toMatch(/envoyé/);
    }
  });

  it('bon contesté : la contestation est en cours de traitement', () => {
    expect(closedBonScreen('contested').title).toBe('Contestation en cours');
    expect(closedBonScreen('cancelled').title).toBe('Bon annulé');
  });

  it('ancien lien d’un document contesté puis « Fondée » : en cours de correction, plus « Contestation en cours » (CM n° 1)', () => {
    const screen = invalidatedLinkScreen('contested');
    expect(screen.title).toBe('Document en cours de correction');
    expect(screen.message).toMatch(/fondée/);
    expect(screen.message).toMatch(/renverra/);
    expect(screen.message).not.toMatch(/en cours de traitement/);
  });
});
