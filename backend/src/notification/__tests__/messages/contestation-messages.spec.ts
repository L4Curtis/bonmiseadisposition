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
