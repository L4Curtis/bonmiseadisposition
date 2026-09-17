import { buildConfirmationMessage } from '../../messages/confirmation-messages';
import { activeBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

describe('buildConfirmationMessage', () => {
  const bon = activeBon() as unknown as NotificationBon;

  it('maps "mise_disposition" to its templateId and label', () => {
    const msg = buildConfirmationMessage(bon, 'mise_disposition');
    expect(msg.templateId).toBe('confirmation_mise_disposition');
    expect(msg.vars.TYPE_LABEL).toBe('mise à disposition');
  });

  it('maps "restitution" to its templateId and label', () => {
    const msg = buildConfirmationMessage(bon, 'restitution');
    expect(msg.templateId).toBe('confirmation_restitution');
    expect(msg.vars.TYPE_LABEL).toBe('restitution');
  });

  it('maps "pv_cloture" to its templateId and label', () => {
    const msg = buildConfirmationMessage(bon, 'pv_cloture');
    expect(msg.templateId).toBe('confirmation_pv_cloture');
    expect(msg.vars.TYPE_LABEL).toBe("procès-verbal d'équipements non restitués");
  });

  it('builds the confirmation subject', () => {
    const msg = buildConfirmationMessage(bon, 'restitution');
    expect(msg.subject).toBe(`[${bon.reference}] Confirmation de signature — ${bon.filiale?.displayName}`);
  });
});
