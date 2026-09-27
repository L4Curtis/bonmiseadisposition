import {
  buildContestationAlertMessage,
  buildContestationResolutionMessage,
} from '../../messages/contestation-messages';
import { activeBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

describe('buildContestationAlertMessage', () => {
  const bon = activeBon() as unknown as NotificationBon;

  it('escapes the contesting user name and message in vars', () => {
    const { vars } = buildContestationAlertMessage(
      bon,
      { displayName: '<b>Jean</b>' },
      '<script>xss</script>',
    );
    expect(vars.USER_NAME).toBe('&lt;b&gt;Jean&lt;/b&gt;');
    expect(vars.CONTESTATION_MESSAGE).toBe('&lt;script&gt;xss&lt;/script&gt;');
  });

  it('falls back to email when displayName is missing', () => {
    const { vars } = buildContestationAlertMessage(bon, { email: 'jean@test.fr' }, 'msg');
    expect(vars.USER_NAME).toBe('jean@test.fr');
  });

  it('builds the plain-text subject without escaping', () => {
    const { subject } = buildContestationAlertMessage(bon, { displayName: 'Jean Dupont' }, 'msg');
    expect(subject).toBe(
      `[CONTESTATION] [${bon.reference}] Jean Dupont conteste son bon — ${bon.filiale?.displayName}`,
    );
  });
});

describe('buildContestationResolutionMessage', () => {
  const bon = activeBon() as unknown as NotificationBon;

  it('maps "resolved" to contestation_resolved', () => {
    const msg = buildContestationResolutionMessage(bon, 'resolved', 'Corrigé');
    expect(msg.templateId).toBe('contestation_resolved');
    expect(msg.vars.RESOLUTION_MESSAGE).toBe('Corrigé');
  });

  it('maps "rejected" to contestation_rejected', () => {
    const msg = buildContestationResolutionMessage(bon, 'rejected');
    expect(msg.templateId).toBe('contestation_rejected');
    expect(msg.vars.RESOLUTION_MESSAGE).toBe('');
  });
});

describe('buildContestationResolutionMessage — contestation Fondée (R-050)', () => {
  const bon = activeBon() as unknown as NotificationBon;

  it('nomme le bon corrigé qui remplacera le bon contesté', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'resolved', 'Numéro corrigé', { reference: 'BON-2026-0099' });
    expect(vars.REPLACEMENT_SENTENCE).toContain('BON-2026-0099');
    expect(vars.REPLACEMENT_SENTENCE).toContain(bon.reference);
  });

  it('sans référence connue, annonce le bon corrigé sans le nommer', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'resolved');
    expect(vars.REPLACEMENT_SENTENCE).toContain('Un bon corrigé va vous être envoyé');
    expect(vars.REPLACEMENT_SENTENCE).not.toMatch(/vous est envoyé/);
  });
});

describe('buildContestationResolutionMessage — ce qui va se passer, selon le document contesté (décision du 26/09)', () => {
  const bon = activeBon() as unknown as NotificationBon;

  it('remise : un bon corrigé, nommé, remplacera le bon contesté', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'resolved', undefined, { reference: 'BON-2026-0099' }, null);
    expect(vars.REPLACEMENT_SENTENCE).toContain('Le bon corrigé');
    expect(vars.REPLACEMENT_SENTENCE).toContain('BON-2026-0099');
    expect(vars.REPLACEMENT_SENTENCE).toContain('il remplacera le bon');
  });

  it('restitution : le bon est corrigé, puis la restitution renvoyée à signer ; aucun nouveau bon annoncé', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'resolved', undefined, null, 'restitution');
    expect(vars.REPLACEMENT_SENTENCE).toBe('Votre bon va être corrigé, puis la restitution vous sera renvoyée à signer.');
    expect(vars.REPLACEMENT_SENTENCE).not.toContain('bon corrigé');
  });

  it('PV : le bon est corrigé, puis le PV de non-restitution renvoyé à signer', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'resolved', undefined, null, 'pv_cloture');
    expect(vars.REPLACEMENT_SENTENCE).toBe(
      'Votre bon va être corrigé, puis le PV de non-restitution vous sera renvoyé à signer.',
    );
  });
});

describe('buildContestationResolutionMessage — « Non retenue » selon ce qui a été signé', () => {
  const bon = activeBon() as unknown as NotificationBon;

  it('lien expiré pendant la contestation : le document reste à signer, bouton pour demander un nouveau lien', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'rejected', 'Vérifié', null, null, {
      signUrl: 'https://bons.test/signer/tok-1', documentType: 'pv_cloture', linkExpired: true, signed: true,
    });
    expect(vars.REJECTION_SENTENCE).toBe(
      'le PV de non-restitution reste à signer. Son lien a expiré : le bouton ci-dessous vous permet d’en demander un nouveau.',
    );
    expect(vars.SIGN_BUTTON).toContain('https://bons.test/signer/tok-1');
    expect(vars.SIGN_BUTTON).toContain('Demander un nouveau lien');
  });

  it('document encore à signer : il reste à signer, avec le bouton pour signer', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'rejected', 'Vérifié', null, null, {
      signUrl: 'https://bons.test/signer/tok-1', documentType: 'restitution', signed: false,
    });
    expect(vars.REJECTION_SENTENCE).toBe('la restitution reste à signer.');
    expect(vars.REJECTION_SENTENCE).not.toContain('tel qu');
    expect(vars.SIGN_BUTTON).toContain('https://bons.test/signer/tok-1');
    expect(vars.SIGN_BUTTON).toContain('Signer');
  });

  it('document déjà signé : le bon reste valable tel qu’il a été signé, sans bouton', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'rejected', undefined, null, null, { signUrl: null, documentType: null, signed: true });
    expect(vars.REJECTION_SENTENCE).toBe('le bon reste valable tel qu’il a été signé.');
    expect(vars.SIGN_BUTTON).toBe('');
  });

  it('rien de signé ni d’attendu (remise constatée sans signature) : jamais « tel qu’il a été signé »', () => {
    const { vars } = buildContestationResolutionMessage(bon, 'rejected', undefined, null, null, { signUrl: null, documentType: null, signed: false });
    expect(vars.REJECTION_SENTENCE).toBe('le bon reste valable tel qu’il a été établi.');
  });
});
