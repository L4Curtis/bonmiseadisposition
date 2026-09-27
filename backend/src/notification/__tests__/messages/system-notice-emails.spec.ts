import {
  buildCancellationNotice,
  buildClosedWithoutSignatureNotice,
  buildHandoverWithoutSignatureNotice,
  buildMarkFoundNotice,
} from '../../messages/system-notice-emails';
import { activeBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

const PORTAL = 'https://bons.livio.fr/mes-bons';

/** Texte visible d'un email (balises retirées, entités courantes décodées). */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&middot;/g, '·')
    .replace(/\s+/g, ' ');
}

describe('buildCancellationNotice', () => {
  it('annonce l’annulation avec son motif', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html, subject } = buildCancellationNotice(bon, 'Doublon du bon BON-2026-0007');
    expect(html).toContain(bon.reference);
    expect(visibleText(html)).toContain('a été annulé');
    expect(visibleText(html)).toContain('Doublon du bon BON-2026-0007');
    expect(subject).toBe(`[${bon.reference}] Bon annulé`);
  });

  it('échappe le nom du collaborateur et le motif', () => {
    const bon = {
      ...activeBon(),
      collaborateur: { displayName: '<img src=x onerror=alert(1)>' },
    } as unknown as NotificationBon;
    const { html } = buildCancellationNotice(bon, '<script>x</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>x</script>');
  });
});

describe('buildHandoverWithoutSignatureNotice — remise constatée, bon En cours (R-014)', () => {
  it('dit que la remise est enregistrée, jamais que le bon est clôturé', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html, subject } = buildHandoverWithoutSignatureNotice(bon, 'Collaborateur en déplacement', PORTAL);
    const text = visibleText(html);
    expect(subject).toBe(`[${bon.reference}] Remise des équipements enregistrée sans votre signature`);
    expect(text).toContain('Remise constatée sans signature');
    expect(text).toContain('Collaborateur en déplacement');
    expect(text).toContain('En cours');
    expect(text).not.toMatch(/clôtur|archiv|actif/i);
    expect(html).toContain(PORTAL);
  });

  it('liste les équipements remis', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildHandoverWithoutSignatureNotice(bon, 'Motif', PORTAL);
    expect(html).toContain('Lenovo ThinkBook 16 G6');
  });
});

describe('buildClosedWithoutSignatureNotice — bon Clôturé (R-014)', () => {
  it('dit que le bon est clôturé, avec l’étape abandonnée et le motif', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html, subject } = buildClosedWithoutSignatureNotice(bon, 'Départ du collaborateur', 'partially_returned', PORTAL);
    const text = visibleText(html);
    expect(subject).toBe(`[${bon.reference}] Bon clôturé sans votre signature`);
    expect(text).toContain('Clôturé sans signature');
    expect(text).toContain('PV de non-restitution');
    expect(text).toContain('Départ du collaborateur');
    expect(text).not.toMatch(/archiv|actif|non rendu/i);
  });

  it('étape de restitution', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildClosedWithoutSignatureNotice(bon, 'Motif', 'sent_restitution', PORTAL);
    expect(visibleText(html)).toContain('la restitution');
  });

  it('échappe le motif', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildClosedWithoutSignatureNotice(bon, '<script>xss</script>', 'sent_restitution', PORTAL);
    expect(html).not.toContain('<script>xss</script>');
  });
});

describe('buildMarkFoundNotice', () => {
  it('lists only the equipments whose id is in equipmentIds', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const targetId = bon.equipments![1].id;
    const { html, subject } = buildMarkFoundNotice(bon, [targetId]);

    expect(html).toContain('Dell UltraSharp U2723QE');
    expect(html).not.toContain('Lenovo ThinkBook 16 G6');
    expect(subject).toBe(`[${bon.reference}] Équipement(s) retrouvé(s)`);
  });

  it('renders a placeholder when no equipment matches', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { html } = buildMarkFoundNotice(bon, ['does-not-exist']);
    expect(html).toContain('Voir le bon en ligne');
  });
});
