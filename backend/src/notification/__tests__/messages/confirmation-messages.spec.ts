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
    expect(msg.vars.PORTAIL_URL).toBe('https://bons.livio.fr/mes-equipements');
    expect(msg.vars.EQUIP_LIST).toContain('Lenovo ThinkBook 16 G6');
    expect(msg.vars.DOCUMENT_LABEL).toBe('bon de mise à disposition');
  });
});

describe('confirmation d’une 2e restitution (R5, constat n° 2)', () => {
  it('liste seulement ce qui vient d’être rendu ; le déjà rendu et le gardé viennent à part', () => {
    const base = activeBon() as unknown as NotificationBon;
    const [pc, ecran, ...rest] = base.equipments ?? [];
    const bon: NotificationBon = {
      ...base,
      equipments: [
        { ...pc, returnedAt: new Date('2026-09-28T09:00:00Z') },
        { ...ecran, returnedAt: new Date('2026-09-28T10:00:00Z') },
        ...rest.map((eq) => ({ ...eq, returnedAt: null, notReturned: false })),
      ],
      signatures: [
        { type: 'restitution', signed: true, signedAt: new Date('2026-09-28T09:30:00Z') },
        { type: 'restitution', signed: true, signedAt: new Date('2026-09-28T10:10:00Z') },
      ],
    };

    const { vars } = buildConfirmationMessage(bon, 'restitution', APP);

    expect(vars.EQUIP_LIST).toContain('Dell UltraSharp U2723QE');
    expect(vars.EQUIP_LIST).not.toContain('Lenovo ThinkBook 16 G6');
    expect(vars.ALREADY_RETURNED_SECTION).toContain('Lenovo ThinkBook 16 G6');
  });

  it('remise : aucune section de restitution', () => {
    const { vars } = buildConfirmationMessage(activeBon() as unknown as NotificationBon, 'mise_disposition', APP);
    expect(vars.ALREADY_RETURNED_SECTION).toBe('');
    expect(vars.REMAINING_SECTION).toBe('');
  });
});

