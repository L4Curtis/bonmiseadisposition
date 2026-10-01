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

  describe('la suite du lien dit la vérité à chaque étape (R5, constats n° 1 et n° 5)', () => {
    it('contestation Fondée, correction en cours : « en cours de correction »', () => {
      const screen = invalidatedLinkScreen('contested', 'link_coming', 'restitution');
      expect(screen.title).toBe('Document en cours de correction');
      expect(screen.message).toMatch(/renverra/);
    });

    it('contestation Fondée, corrigée et renvoyée : « Restitution corrigée », un nouveau lien a été envoyé', () => {
      const screen = invalidatedLinkScreen('contested', 'link_sent', 'restitution');
      expect(screen.title).toBe('Restitution corrigée');
      expect(screen.message).toBe('La restitution a été corrigée : un nouveau lien vous a été envoyé.');
    });

    it('PV contesté, corrigé et renvoyé : « PV de non-restitution corrigé »', () => {
      const screen = invalidatedLinkScreen('contested', 'link_sent', 'pv_cloture');
      expect(screen.title).toBe('PV de non-restitution corrigé');
      expect(screen.message).toBe('Le PV de non-restitution a été corrigé : un nouveau lien vous a été envoyé.');
    });

    it('corrigée puis à signer au guichet : pas de lien par email annoncé', () => {
      const screen = invalidatedLinkScreen('return_corrected', 'in_person', 'restitution');
      expect(screen.title).toBe('Restitution corrigée');
      expect(screen.message).toMatch(/guichet/);
      expect(screen.message).not.toMatch(/nouveau lien/);
    });

    it('marquage annulé et plus rien à signer : jamais « un nouveau lien vous sera envoyé »', () => {
      const screen = invalidatedLinkScreen('return_corrected', 'none', 'restitution');
      expect(screen.title).toBe('Restitution corrigée');
      expect(screen.message).not.toMatch(/nouveau lien/);
      expect(screen.message).toMatch(/plus rien à signer/);
    });

    it('marquage corrigé, restitution toujours à signer : le nouveau lien est annoncé au futur', () => {
      expect(invalidatedLinkScreen('return_corrected', 'link_coming', 'restitution').message).toMatch(/vous sera envoyé/);
    });

    it('bon modifié puis renvoyé : « un nouveau lien vous a été envoyé », au passé', () => {
      const screen = invalidatedLinkScreen('modified', 'link_sent', 'mise_disposition');
      expect(screen.title).toBe('Bon modifié');
      expect(screen.message).toBe('Ce bon a été modifié : un nouveau lien vous a été envoyé.');
    });

    it('contestation Fondée d’une remise : le bon corrigé suit, message inchangé', () => {
      expect(invalidatedLinkScreen('contested', 'link_coming', 'mise_disposition').title).toBe('Document en cours de correction');
    });
  });
});
