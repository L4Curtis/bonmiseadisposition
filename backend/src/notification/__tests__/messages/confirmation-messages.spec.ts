import { buildConfirmationMessage } from '../../messages/confirmation-messages';
import { activeBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

const APP = 'https://bons.livio.fr';

describe('buildConfirmationMessage', () => {
  const bon = activeBon() as unknown as NotificationBon;

  it('maps "mise_disposition" to its templateId and label', () => {
    const msg = buildConfirmationMessage(bon, 'mise_disposition', APP);
    expect(msg.templateId).toBe('confirmation_mise_disposition');
    expect(msg.vars.TYPE_LABEL).toBe('mise à disposition');
  });

  it('maps "restitution" to its templateId and label', () => {
    const msg = buildConfirmationMessage(bon, 'restitution', APP);
    expect(msg.templateId).toBe('confirmation_restitution');
    expect(msg.vars.TYPE_LABEL).toBe('restitution');
  });

  it('maps "pv_cloture" to its templateId and label', () => {
    const msg = buildConfirmationMessage(bon, 'pv_cloture', APP);
    expect(msg.templateId).toBe('confirmation_pv_cloture');
    expect(msg.vars.TYPE_LABEL).toBe('PV de non-restitution');
    expect(msg.vars.DOCUMENT_LABEL).toBe('PV de non-restitution');
  });

  it('builds the confirmation subject', () => {
    const msg = buildConfirmationMessage(bon, 'restitution', APP);
    expect(msg.subject).toBe(`[${bon.reference}] Signature confirmée — bon de restitution`);
  });

  it('mène au portail et liste les équipements (R-036)', () => {
    const msg = buildConfirmationMessage(bon, 'mise_disposition', APP);
    expect(msg.vars.PORTAIL_URL).toBe('https://bons.livio.fr/mes-bons');
    expect(msg.vars.EQUIP_LIST).toContain('Lenovo ThinkBook 16 G6');
    expect(msg.vars.DOCUMENT_LABEL).toBe('bon de mise à disposition');
  });
});
