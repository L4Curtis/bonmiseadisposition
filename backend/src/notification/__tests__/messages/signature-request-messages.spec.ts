import {
  buildMiseDispositionRequestMessage,
  buildRestitutionRequestMessage,
  buildPvClotureRequestMessage,
} from '../../messages/signature-request-messages';
import { activeBon, partiallyReturnedBon } from '../../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../../common/types';

describe('buildMiseDispositionRequestMessage', () => {
  it('builds vars and subject with the signer URL and equipment list', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { vars, subject } = buildMiseDispositionRequestMessage(bon, 'https://app.test/signer/tok');

    expect(vars.REFERENCE).toBe(bon.reference);
    expect(vars.SIGNER_URL).toBe('https://app.test/signer/tok');
    expect(vars.COLLAB_CIVILITE).toBe('Monsieur');
    expect(vars.EQUIP_LIST).toContain('Lenovo ThinkBook 16 G6');
    expect(subject).toBe(`[${bon.reference}] Bon de mise à disposition à signer — ${bon.filiale?.displayName}`);
  });

  it('uses "Madame" for civilite "mme"', () => {
    const bon = { ...activeBon(), civilite: 'mme' } as unknown as NotificationBon;
    const { vars } = buildMiseDispositionRequestMessage(bon, '#');
    expect(vars.COLLAB_CIVILITE).toBe('Madame');
  });
});

describe('buildRestitutionRequestMessage', () => {
  it('lists only the returned equipment and leaves REMAINING_SECTION empty when everything is returned', () => {
    const bon = activeBon() as unknown as NotificationBon;
    bon.equipments = (bon.equipments ?? []).map((eq) => ({ ...eq, returnedAt: new Date('2026-03-01') }));

    const { vars } = buildRestitutionRequestMessage(bon, '#');

    expect(vars.REMAINING_SECTION).toBe('');
    expect(vars.EQUIP_LIST).toContain('Lenovo ThinkBook 16 G6');
  });

  it('builds a non-empty REMAINING_SECTION for a partial restitution', () => {
    const bon = activeBon() as unknown as NotificationBon;
    bon.equipments = [
      { ...bon.equipments![0], returnedAt: new Date('2026-03-01') },
      bon.equipments![1], // still loaned
    ];

    const { vars } = buildRestitutionRequestMessage(bon, '#');

    expect(vars.REMAINING_SECTION).toContain('Éléments restants sur ce bon (1)');
    expect(vars.REMAINING_SECTION).toContain('Dell UltraSharp U2723QE');
  });

  it('falls back to the full equipment list when nothing is flagged returnedAt', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { vars } = buildRestitutionRequestMessage(bon, '#');
    expect(vars.EQUIP_LIST).toContain('Lenovo ThinkBook 16 G6');
    expect(vars.EQUIP_LIST).toContain('Dell UltraSharp U2723QE');
  });
});

describe('buildPvClotureRequestMessage', () => {
  it('builds the not-returned list and subject', () => {
    const bon = partiallyReturnedBon() as unknown as NotificationBon;
    const { vars, subject } = buildPvClotureRequestMessage(bon, 'https://app.test/signer/pv');

    expect(vars.SIGNER_URL).toBe('https://app.test/signer/pv');
    expect(vars.NOT_RETURNED_LIST).toContain('Perdu');
    expect(subject).toContain("Procès-verbal d'équipements non restitués à signer");
  });
});
