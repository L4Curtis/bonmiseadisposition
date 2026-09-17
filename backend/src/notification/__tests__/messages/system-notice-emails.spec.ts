import {
  buildCancellationNotice,
  buildMarkFoundNotice,
  buildUnilateralCloseNotice,
} from '../../messages/system-notice-emails';
import { activeBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

describe('buildCancellationNotice', () => {
  it('builds an HTML notice mentioning the reference and an "annulé" subject', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html, subject } = buildCancellationNotice(bon);
    expect(html).toContain(bon.reference);
    expect(html).toContain('annulé');
    expect(subject).toBe(`Bon ${bon.reference} — annulé`);
  });

  it('escapes an XSS payload in the collaborator display name', () => {
    const bon = {
      ...activeBon(),
      collaborateur: { displayName: '<img src=x onerror=alert(1)>' },
    } as unknown as NotificationBon;
    const { html } = buildCancellationNotice(bon);
    expect(html).not.toContain('<img src=x');
  });
});

describe('buildMarkFoundNotice', () => {
  it('lists only the equipments whose id is in equipmentIds', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const targetId = bon.equipments![1].id;
    const { html, subject } = buildMarkFoundNotice(bon, [targetId]);

    expect(html).toContain('Dell UltraSharp U2723QE');
    expect(html).not.toContain('Lenovo ThinkBook 16 G6');
    expect(subject).toBe(`Bon ${bon.reference} — équipement(s) retrouvé(s)`);
  });

  it('renders a placeholder when no equipment matches', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildMarkFoundNotice(bon, ['does-not-exist']);
    expect(html).toContain('Voir le bon en ligne');
  });
});

describe('buildUnilateralCloseNotice', () => {
  it('describes the "active" outcome when newStatus is active', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildUnilateralCloseNotice(bon, 'Motif test', 'active');
    expect(html).toContain('la remise du matériel a été constatée et le bon est désormais actif');
  });

  it('describes the closure outcome for any other newStatus', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildUnilateralCloseNotice(bon, 'Motif test', 'archived');
    expect(html).toContain('le bon a été clôturé et archivé');
  });

  it('escapes the reason', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildUnilateralCloseNotice(bon, '<script>xss</script>', 'archived');
    expect(html).not.toContain('<script>xss</script>');
  });
});
