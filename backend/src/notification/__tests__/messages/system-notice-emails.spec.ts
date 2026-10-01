import {
  buildBonReplacedNotice,
  buildCancellationNotice,
  buildClosedWithoutSignatureNotice,
  buildHandoverWithoutSignatureNotice,
  buildMarkFoundNotice,
} from '../../messages/system-notice-emails';
import { buildLinkRequestAlert } from '../../messages/link-request-alert-message';
import {
  defaultBonCancelled,
  defaultBonReplaced,
  defaultClosedWithoutSignature,
  defaultEquipmentFound,
  defaultHandoverWithoutSignature,
  defaultLinkRequestAlert,
} from '../../../templates/defaults/notice-defaults';
import { renderTemplateHtml } from '../../../templates/render';
import { activeBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

const PORTAL = 'https://bons.livio.fr/mes-equipements';

/** Texte visible d'un email (balises retirées, entités courantes décodées). */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&middot;/g, '·')
    .replace(/\s+/g, ' ');
}

/** Email tel que reçu avec le modèle par défaut. */
function rendered(message: { vars: Record<string, string> }, template: () => string): string {
  return renderTemplateHtml(template(), message.vars);
}

describe('buildCancellationNotice — modèle « bon_cancelled »', () => {
  it('annonce l’annulation avec son motif', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const message = buildCancellationNotice(bon, 'Doublon du bon BON-2026-0007');
    const html = rendered(message, defaultBonCancelled);
    expect(message.templateId).toBe('bon_cancelled');
    expect(html).toContain(bon.reference);
    expect(visibleText(html)).toContain('a été annulé');
    expect(visibleText(html)).toContain('Doublon du bon BON-2026-0007');
    expect(message.subject).toBe(`[${bon.reference}] Bon annulé`);
  });

  it('échappe le nom du collaborateur et le motif', () => {
    const bon = {
      ...activeBon(),
      collaborateur: { displayName: '<img src=x onerror=alert(1)>' },
    } as unknown as NotificationBon;
    const html = rendered(buildCancellationNotice(bon, '<script>x</script>'), defaultBonCancelled);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>x</script>');
  });
});

describe('buildHandoverWithoutSignatureNotice — remise constatée, bon En cours (R-014)', () => {
  it('dit que la remise est enregistrée, jamais que le bon est clôturé', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const message = buildHandoverWithoutSignatureNotice(bon, 'Collaborateur en déplacement', PORTAL);
    const text = visibleText(rendered(message, defaultHandoverWithoutSignature));
    expect(message.templateId).toBe('handover_without_signature');
    expect(message.subject).toBe(`[${bon.reference}] Remise des équipements enregistrée sans votre signature`);
    expect(text).toContain('Remise constatée sans signature');
    expect(text).toContain('Collaborateur en déplacement');
    expect(text).toContain('En cours');
    expect(text).not.toMatch(/clôtur|archiv|actif/i);
    expect(rendered(message, defaultHandoverWithoutSignature)).toContain(PORTAL);
  });

  it('liste les équipements remis', () => {
    const bon = activeBon() as unknown as NotificationBon;
    expect(rendered(buildHandoverWithoutSignatureNotice(bon, 'Motif', PORTAL), defaultHandoverWithoutSignature)).toContain('Lenovo ThinkBook 16 G6');
  });
});

describe('buildClosedWithoutSignatureNotice — bon Clôturé (R-014)', () => {
  it('dit que le bon est clôturé, avec l’étape abandonnée et le motif', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const message = buildClosedWithoutSignatureNotice(bon, 'Départ du collaborateur', 'partially_returned', PORTAL);
    const text = visibleText(rendered(message, defaultClosedWithoutSignature));
    expect(message.templateId).toBe('closed_without_signature');
    expect(message.subject).toBe(`[${bon.reference}] Bon clôturé sans votre signature`);
    expect(text).toContain('Clôturé sans signature');
    expect(text).toContain('PV de non-restitution');
    expect(text).toContain('Départ du collaborateur');
    expect(text).not.toMatch(/archiv|actif|non rendu/i);
  });

  it('étape de restitution', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const html = rendered(buildClosedWithoutSignatureNotice(bon, 'Motif', 'sent_restitution', PORTAL), defaultClosedWithoutSignature);
    expect(visibleText(html)).toContain('la restitution');
  });

  it('échappe le motif', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const html = rendered(buildClosedWithoutSignatureNotice(bon, '<script>xss</script>', 'sent_restitution', PORTAL), defaultClosedWithoutSignature);
    expect(html).not.toContain('<script>xss</script>');
  });
});

describe('buildBonReplacedNotice — modèle « bon_replaced »', () => {
  it('nomme le bon corrigé et le bon remplacé', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const message = buildBonReplacedNotice(bon, 'BON-2026-0099', PORTAL);
    const text = visibleText(rendered(message, defaultBonReplaced));
    expect(message.templateId).toBe('bon_replaced');
    expect(message.subject).toBe(`[${bon.reference}] Bon remplacé par BON-2026-0099`);
    expect(text).toContain('BON-2026-0099');
    expect(text).toContain('remplace');
  });
});

describe('buildMarkFoundNotice — modèle « equipment_found »', () => {
  it('ne liste que les équipements retrouvés', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const targetId = bon.equipments![1].id;
    const message = buildMarkFoundNotice(bon, [targetId]);
    const html = rendered(message, defaultEquipmentFound);
    expect(message.templateId).toBe('equipment_found');
    expect(html).toContain('Dell UltraSharp U2723QE');
    expect(html).not.toContain('Lenovo ThinkBook 16 G6');
    expect(message.subject).toBe(`[${bon.reference}] Équipement(s) retrouvé(s)`);
  });

  it('aucun équipement correspondant : texte de repli', () => {
    const bon = activeBon() as unknown as NotificationBon;
    expect(rendered(buildMarkFoundNotice(bon, ['does-not-exist']), defaultEquipmentFound)).toContain('Voir le bon en ligne');
  });
});

describe('buildLinkRequestAlert — modèle « link_request_alert »', () => {
  it('lien direct vers la fiche, document et date d’expiration', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const message = buildLinkRequestAlert(
      bon,
      { documentType: 'restitution', requesterEmail: 'lea@livio.fr', expiredAt: new Date('2026-09-15T10:00:00Z') },
      'https://bons.test',
    );
    const text = visibleText(rendered(message, defaultLinkRequestAlert));
    expect(message.templateId).toBe('link_request_alert');
    expect(message.subject).toContain('[NOUVEAU LIEN]');
    expect(rendered(message, defaultLinkRequestAlert)).toContain(`https://bons.test/bons/${bon.id}`);
    expect(text).toContain('bon de restitution');
    expect(text).toContain('15 septembre 2026');
    expect(text).toContain('lea@livio.fr');
  });
});
