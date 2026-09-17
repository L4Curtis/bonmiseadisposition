import { buildRestitutionDueReminderMessage } from '../../messages/restitution-due-reminder-message';
import { activeBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

describe('buildRestitutionDueReminderMessage', () => {
  it('builds vars with the portal URL (no signer link) and formatted date', () => {
    const bon = {
      ...activeBon(),
      dateRestitution: new Date('2026-04-12'),
    } as unknown as NotificationBon;

    const { vars, subject } = buildRestitutionDueReminderMessage(bon, 'https://app.test');

    expect(vars.PORTAIL_URL).toBe('https://app.test/mes-bons');
    expect(vars).not.toHaveProperty('SIGNER_URL');
    expect(vars.DATE_RESTITUTION).toContain('2026');
    expect(subject).toContain(bon.reference);
  });

  it('leaves DATE_RESTITUTION empty when the bon has no dateRestitution', () => {
    const bon = { ...activeBon(), dateRestitution: null } as unknown as NotificationBon;
    const { vars } = buildRestitutionDueReminderMessage(bon, 'https://app.test');
    expect(vars.DATE_RESTITUTION).toBe('');
  });

  it('only lists equipment that is still loaned (excludes returned/not-returned)', () => {
    const bon = activeBon() as unknown as NotificationBon;
    bon.equipments = [
      { ...bon.equipments![0], returnedAt: new Date('2026-03-01') },
      { ...bon.equipments![1], notReturned: true },
      bon.equipments![2],
    ];

    const { vars } = buildRestitutionDueReminderMessage(bon, 'https://app.test');

    expect(vars.EQUIP_LIST).toContain('Logitech MX Master 3S');
    expect(vars.EQUIP_LIST).not.toContain('Lenovo ThinkBook 16 G6');
    expect(vars.EQUIP_LIST).not.toContain('Dell UltraSharp U2723QE');
  });
});
