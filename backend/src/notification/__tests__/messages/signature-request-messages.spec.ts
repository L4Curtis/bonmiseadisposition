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

  it('date de remise à l’heure de Paris (R-040)', () => {
    const bon = { ...activeBon(), dateMiseDisposition: new Date('2026-09-24T22:30:00Z') } as unknown as NotificationBon;
    expect(buildMiseDispositionRequestMessage(bon, '#').vars.DATE_MISE_DISPO).toBe('25 septembre 2026');
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
    expect(subject).toBe(`[${bon.reference}] PV de non-restitution à signer — ${bon.filiale?.displayName}`);
  });
});

describe('restitution en plusieurs fois et document corrigé (R5)', () => {
  const firstSignedAt = new Date('2026-09-28T09:30:00Z');
  function secondRestitutionBon(): NotificationBon {
    const bon = activeBon() as unknown as NotificationBon;
    const [pc, ecran] = bon.equipments ?? [];
    return {
      ...bon,
      equipments: [
        { ...pc, returnedAt: new Date('2026-09-28T09:00:00Z') },
        { ...ecran, returnedAt: new Date('2026-09-28T10:00:00Z') },
      ],
      signatures: [{ type: 'restitution', signed: true, signedAt: firstSignedAt }],
    };
  }

  it('2e restitution : seul l’équipement rendu cette fois est « restitué », le précédent est rappelé à part', () => {
    const { vars } = buildRestitutionRequestMessage(secondRestitutionBon(), '#');
    expect(vars.EQUIP_LIST).toContain('Dell UltraSharp U2723QE');
    expect(vars.EQUIP_LIST).not.toContain('Lenovo ThinkBook 16 G6');
    expect(vars.ALREADY_RETURNED_SECTION).toContain('Déjà restitués lors d’une restitution précédente (1)');
    expect(vars.ALREADY_RETURNED_SECTION).toContain('Lenovo ThinkBook 16 G6');
  });

  it('première demande : ni mention de correction, ni sujet « corrigée »', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { vars, subject } = buildRestitutionRequestMessage(bon, '#');
    expect(vars.CORRECTION_NOTICE).toBe('');
    expect(vars.ALREADY_RETURNED_SECTION).toBe('');
    expect(subject).toContain('Bon de restitution à signer');
  });

  it('après une contestation Fondée : « Restitution corrigée » dans le sujet et le corps', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { vars, subject } = buildRestitutionRequestMessage(bon, '#', { correction: 'contested' });
    expect(subject).toBe(`[${bon.reference}] Restitution corrigée à signer — ${bon.filiale?.displayName}`);
    expect(vars.CORRECTION_NOTICE).toContain('Suite à votre contestation, la restitution a été corrigée.');
    expect(vars.CORRECTION_NOTICE).toContain('Ce lien remplace le précédent');
  });

  it('marquage corrigé par l’IT : la correction est dite, sans parler de contestation', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { vars } = buildRestitutionRequestMessage(bon, '#', { correction: 'return_corrected' });
    expect(vars.CORRECTION_NOTICE).toContain('La restitution a été corrigée par l’équipe informatique.');
    expect(vars.CORRECTION_NOTICE).not.toContain('contestation');
  });

  it('PV contesté puis corrigé : « PV de non-restitution corrigé »', () => {
    const bon = partiallyReturnedBon() as unknown as NotificationBon;
    const { vars, subject } = buildPvClotureRequestMessage(bon, '#', { correction: 'contested' });
    expect(subject).toContain('PV de non-restitution corrigé à signer');
    expect(vars.CORRECTION_NOTICE).toContain('le PV de non-restitution a été corrigé');
  });

  it('remise modifiée après envoi : « modifié » dans le sujet et le corps', () => {
    const bon = activeBon() as unknown as NotificationBon;
    const { vars, subject } = buildMiseDispositionRequestMessage(bon, '#', { correction: 'modified' });
    expect(subject).toContain('Bon de mise à disposition modifié à signer');
    expect(vars.CORRECTION_NOTICE).toContain('Ce bon a été modifié depuis le précédent envoi.');
  });
});

