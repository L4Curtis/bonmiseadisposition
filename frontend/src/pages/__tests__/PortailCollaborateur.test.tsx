import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { PortalBon } from '@/contracts/bons';
import type { MyContestation } from '@/contracts/contestations';
import { renderWithProviders } from '@/test/render';
import { PortailCollaborateur } from '../PortailCollaborateur';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

import { api } from '@/lib/api';

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function signature(extra: Record<string, unknown>) {
  return {
    id: `s-${Math.random()}`,
    type: 'mise_disposition',
    signed: false,
    signedAt: null,
    signerEmail: null,
    mentionLuApprouve: false,
    isInPerson: false,
    tokenExpiresAt: FUTURE,
    createdAt: '2026-09-01T00:00:00Z',
    pdfType: null,
    ...extra,
  };
}

function equipment(extra: Record<string, unknown> = {}) {
  return {
    id: `e-${Math.random()}`,
    order: 0,
    serialNumber: 'SN-PORTABLE-1',
    inventoryNumber: null,
    customLabel: null,
    returnedAt: null,
    notReturned: false,
    notReturnedReason: null,
    catalogItem: { id: 'c', brand: 'Apple', model: 'MacBook Air 13', category: 'pc_portable' },
    ...extra,
  };
}

function bon(extra: Record<string, unknown>): PortalBon {
  return {
    id: String(extra.reference),
    status: 'active',
    civilite: 'mme',
    dateMiseDisposition: '2026-07-16T00:00:00Z',
    filiale: { displayName: 'Bâtir Nord' },
    equipments: [],
    signatures: [],
    ...extra,
  } as unknown as PortalBon;
}

// Léa, comme dans l'état des lieux : S03 remise à signer (lien expiré),
// S08 PV à signer (lien expiré), S06 restitution partielle signée avec du
// matériel encore chez elle, S04 en cours, S21 contestée.
const LEA = [
  bon({ reference: 'S03', status: 'sent_mise_dispo', equipments: [equipment()], signatures: [signature({ tokenExpiresAt: PAST })] }),
  bon({
    reference: 'S08',
    status: 'partially_returned',
    equipments: [equipment({ notReturned: true })],
    signatures: [signature({ signed: true }), signature({ type: 'pv_cloture', tokenExpiresAt: PAST, createdAt: '2026-09-10T00:00:00Z' })],
  }),
  bon({
    reference: 'S06',
    status: 'partially_returned',
    equipments: [equipment({ returnedAt: '2026-09-01T00:00:00Z' }), equipment({ serialNumber: 'SN-ECRAN-6', catalogItem: { id: 'e', brand: 'Dell', model: 'P2422H', category: 'ecran' } })],
    signatures: [signature({ signed: true }), signature({ type: 'restitution', signed: true, createdAt: '2026-09-02T00:00:00Z' })],
  }),
  bon({ reference: 'S04', status: 'active', equipments: [equipment({ serialNumber: 'SN-S04' })], signatures: [signature({ signed: true })] }),
  bon({ reference: 'S21', status: 'contested', equipments: [equipment({ serialNumber: 'SN-S21' })] }),
];

const S21_CONTESTATION: MyContestation = {
  id: 'c21',
  bon: { id: 'S21', reference: 'S21' },
  contestedDocument: 'mise_disposition',
  message: 'Le numéro de série de l’écran ne correspond pas.',
  status: 'open',
  outcome: null,
  createdAt: '2026-09-16T10:00:00Z',
  reviewedAt: null,
  resolvedAt: null,
  resolutionMessage: null,
  replacementBon: null,
};

function mockPortal(bons: PortalBon[], contestations: MyContestation[] = []) {
  vi.mocked(api.get).mockImplementation((path: string) =>
    Promise.resolve(path === '/contestations/mine' ? contestations : bons),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Portail « Mes équipements » (R-057, R-090)', () => {
  it('range par ce qu’il y a à faire : S03 et S08 à signer, S06 en cours, rien d’actif dans l’historique', async () => {
    mockPortal(LEA, [S21_CONTESTATION]);
    renderWithProviders(<PortailCollaborateur />);

    expect(await screen.findByText('Vous avez 2 documents à signer.')).toBeInTheDocument();
    const toSign = screen.getByRole('region', { name: /À signer/ });
    expect(within(toSign).getByText(/S03/)).toBeInTheDocument();
    expect(within(toSign).getByText(/S08/)).toBeInTheDocument();
    expect(within(toSign).getByText('PV de non-restitution à signer')).toBeInTheDocument();
    const current = screen.getByRole('region', { name: 'Bons en cours' });
    expect(within(current).getByText('S06')).toBeInTheDocument();
    expect(within(current).getByText('S04')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Historique' })).not.toBeInTheDocument();
  });

  it('restitution en cours de correction (contestation Fondée) : bloc à part, hors « À signer » et du compteur, matériel toujours « Chez vous »', async () => {
    const s25 = bon({
      reference: 'S25',
      status: 'sent_restitution',
      equipments: [equipment({ id: 'casque', serialNumber: 'SN-CASQUE-25', returnState: 'returned_to_sign' })],
      signatures: [
        signature({ signed: true, signedAt: '2026-08-01T00:00:00Z' }),
        signature({ type: 'restitution', tokenExpiresAt: new Date(0).toISOString(), invalidatedReason: 'contested', createdAt: '2026-09-20T00:00:00Z' }),
      ],
      pendingSignature: { type: 'restitution', expired: true, inPerson: false, itSigned: false, sentAt: null, expiresAt: null },
    });
    mockPortal([...LEA, s25]);
    renderWithProviders(<PortailCollaborateur />);

    // Le chiffre du bandeau et celui de la rubrique disent la même chose.
    expect(await screen.findByText('Vous avez 2 documents à signer.')).toBeInTheDocument();
    const toSign = screen.getByRole('region', { name: /À signer/ });
    expect(within(toSign).getByRole('heading', { name: /À signer \(2\)/ })).toBeInTheDocument();
    expect(within(toSign).queryByText(/S25/)).not.toBeInTheDocument();

    const correction = screen.getByRole('region', { name: /En cours de correction par l'équipe informatique/ });
    expect(within(correction).getByText(/S25/)).toBeInTheDocument();
    expect(within(correction).getByText(/Votre contestation est fondée/)).toBeInTheDocument();
    expect(within(correction).queryByRole('button', { name: /Je ne suis pas d'accord/ })).not.toBeInTheDocument();

    const held = screen.getByRole('region', { name: /Chez vous/ });
    expect(within(held).getByText('SN-CASQUE-25')).toBeInTheDocument();
  });

  it('S23 (bon modifié) : « En attente d’un nouveau lien », hors « À signer » et du compteur, titre juste (R5)', async () => {
    const s23 = bon({
      reference: 'S23',
      status: 'sent_mise_dispo',
      equipments: [equipment({ serialNumber: 'SN-S23' })],
      signatures: [signature({ tokenExpiresAt: new Date(0).toISOString(), invalidatedReason: 'modified' })],
      pendingSignature: { type: 'mise_disposition', expired: true, inPerson: false, itSigned: false, sentAt: null, expiresAt: null },
    });
    mockPortal([...LEA, s23]);
    renderWithProviders(<PortailCollaborateur />);

    expect(await screen.findByText('Vous avez 2 documents à signer.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /À signer/ })).queryByText(/S23/)).not.toBeInTheDocument();
    const waiting = screen.getByRole('region', { name: /En attente d'un nouveau lien \(1\)/ });
    expect(within(waiting).getByText('Bon de mise à disposition en attente d’un nouveau lien')).toBeInTheDocument();
    expect(within(waiting).getByText('Ce bon a été modifié : un nouveau lien vous sera envoyé.')).toBeInTheDocument();
    const held = screen.getByRole('region', { name: /Chez vous/ });
    const card = within(held).getByText('SN-S23').closest('li') as HTMLElement;
    expect(within(card).getByText('Nouveau lien à venir')).toBeInTheDocument();
    expect(within(card).queryByText('À signer')).not.toBeInTheDocument();
  });

  it('carte en correction : titrée « Restitution en cours de correction », jamais « à signer » (R5)', async () => {
    const s25 = bon({
      reference: 'S25',
      status: 'sent_restitution',
      equipments: [equipment({ returnState: 'returned_to_sign' })],
      signatures: [
        signature({ signed: true, signedAt: '2026-08-01T00:00:00Z' }),
        signature({ type: 'restitution', tokenExpiresAt: new Date(0).toISOString(), invalidatedReason: 'contested', createdAt: '2026-09-20T00:00:00Z' }),
      ],
      pendingSignature: { type: 'restitution', expired: true, inPerson: false, itSigned: false, sentAt: null, expiresAt: null },
    });
    mockPortal([s25]);
    renderWithProviders(<PortailCollaborateur />);

    const correction = await screen.findByRole('region', { name: /En cours de correction par l'équipe informatique/ });
    expect(within(correction).getByText('Restitution en cours de correction')).toBeInTheDocument();
    expect(within(correction).queryByRole('heading', { name: /à signer/ })).not.toBeInTheDocument();
  });

  it('liste les équipements chez la personne, avec n° de série et catégorie lisible, jamais le code', async () => {
    mockPortal(LEA);
    renderWithProviders(<PortailCollaborateur />);

    const held = await screen.findByRole('region', { name: /Chez vous/ });
    expect(within(held).getByText('SN-ECRAN-6')).toBeInTheDocument();
    expect(within(held).getAllByText(/Écran/).length).toBeGreaterThan(0);
    expect(within(held).queryByText(/pc_portable|ecran/)).not.toBeInTheDocument();
    // S08 (déclaré non restitué) n'y est pas.
    expect(within(held).queryByText('Voir le bon S08')).not.toBeInTheDocument();
  });

  it('« Chez vous » montre aussi le matériel d’une remise à signer, marqué « À signer »', async () => {
    mockPortal(LEA);
    renderWithProviders(<PortailCollaborateur />);

    const held = await screen.findByRole('region', { name: /Chez vous/ });
    const s03 = within(held).getByText('Voir le bon S03').closest('li');
    expect(s03).not.toBeNull();
    expect(within(s03 as HTMLElement).getByText('À signer')).toBeInTheDocument();
    // Lien expiré : pas de bouton de signature ici, la carte « À signer » porte l'action.
    expect(within(s03 as HTMLElement).queryByRole('link', { name: /Signer la remise/ })).not.toBeInTheDocument();
  });

  it('remise à signer au lien valide : « Signer la remise » depuis « Chez vous »', async () => {
    mockPortal([
      bon({
        reference: 'S30',
        status: 'sent_mise_dispo',
        equipments: [equipment({ serialNumber: 'SN-NEUF' })],
        signatures: [signature({ token: 'tok-s30' })],
      }),
    ]);
    renderWithProviders(<PortailCollaborateur />);

    const held = await screen.findByRole('region', { name: /Chez vous/ });
    expect(within(held).getByText('SN-NEUF')).toBeInTheDocument();
    expect(within(held).getByRole('link', { name: /Signer la remise/ })).toHaveAttribute('href', '/signer/tok-s30');
  });

  it('montre le suivi de la contestation, date comprise', async () => {
    mockPortal(LEA, [S21_CONTESTATION]);
    renderWithProviders(<PortailCollaborateur />);

    const contested = await screen.findByRole('region', { name: 'Contestés' });
    expect(within(contested).getByText('Envoyée le 16 septembre 2026 — pas encore prise en charge')).toBeInTheDocument();
  });

  it('un seul document signable : le bandeau ouvre directement sa signature', async () => {
    mockPortal([bon({ reference: 'R1', status: 'sent_restitution', signatures: [signature({ type: 'restitution', token: 'tok-1' })] })]);
    renderWithProviders(<PortailCollaborateur />);

    const links = await screen.findAllByRole('link', { name: 'Signer maintenant' });
    expect(links.every((l) => l.getAttribute('href') === '/signer/tok-1')).toBe(true);
    expect(screen.getByRole('button', { name: /je ne suis pas d'accord/i })).toBeInTheDocument();
  });

  it('signature au guichet : pas de lien, on le dit', async () => {
    mockPortal([
      bon({ reference: 'G1', status: 'sent_mise_dispo', signatures: [signature({ isInPerson: true, inPersonPending: true })] }),
    ]);
    renderWithProviders(<PortailCollaborateur />);

    expect(await screen.findByText(/se signe au guichet/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Signer maintenant' })).not.toBeInTheDocument();
  });

  it('le suivi des contestations indisponible n’empêche pas d’afficher les bons', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/contestations/mine' ? Promise.reject(new Error('panne')) : Promise.resolve(LEA),
    );
    renderWithProviders(<PortailCollaborateur />);
    expect(await screen.findByText('Vous avez 2 documents à signer.')).toBeInTheDocument();
  });
});
