import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MaterielHistoryPage } from '../MaterielHistoryPage';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), getBlob: vi.fn() } };
});

// État mutable partagé avec le mock (vi.hoisted : accessible depuis la
// factory hoistée ET depuis les tests, pour changer de rôle sans re-mocker).
const authState = vi.hoisted(() => ({ role: 'admin' as string }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: authState.role }, loading: false, refetch: vi.fn(), logout: vi.fn() }),
}));

import { api } from '@/lib/api';

/**
 * Ces cas reprennent ceux de l'ancienne SerialHistoryModal.test.tsx (modale
 * supprimée au lot L1, remplacée par cette page dédiée /materiel/:reference) :
 * rendu des entrées, troncature signalée, état vide, erreur lisible.
 */
function entree(reference: string, bonId: string, overrides: Record<string, unknown> = {}) {
  return {
    equipmentId: `e-${bonId}`,
    serialNumber: 'SN-123',
    inventoryNumber: null,
    label: 'Laptop',
    returnedAt: null,
    notReturned: false,
    bon: {
      id: bonId,
      reference,
      status: 'active',
      dateMiseDisposition: '2026-01-05T00:00:00.000Z',
      dateRestitution: null,
      collaborateur: { displayName: 'Jean Dupont', email: 'jean@x.fr' },
      filiale: { displayName: 'Siège' },
    },
    ...overrides,
  };
}

function renderPage(reference = 'SN-123') {
  return renderWithProviders(<MaterielHistoryPage />, {
    route: `/materiel/${reference}`,
    path: '/materiel/:reference',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  authState.role = 'admin';
});

describe('MaterielHistoryPage', () => {
  it('affiche les bons renvoyés dans items', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1'), entree('BON-2026-0002', 'b2')],
      truncated: false,
      total: 2,
    });

    renderPage();

    expect(await screen.findByText('BON-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('BON-2026-0002')).toBeInTheDocument();
  });

  it('signale un historique tronqué avec le compte réel', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1')],
      truncated: true,
      total: 250,
    });

    renderPage();

    expect(await screen.findByText(/sur 250/)).toBeInTheDocument();
  });

  it('affiche un état vide clair quand la référence est inconnue', async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], truncated: false, total: 0 });

    renderPage('SN-INCONNU');

    expect(await screen.findByText(/Aucun bon ne référence/i)).toBeInTheDocument();
    expect(screen.getByText('SN-INCONNU')).toBeInTheDocument();
  });

  it('affiche une erreur lisible quand l’appel échoue', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Erreur HTTP 500'));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur HTTP 500');
  });

  it('affiche l\'état actuel « en circulation » et le bouton export quand le matériel n\'est pas rendu', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1')],
      truncated: false,
      total: 1,
    });

    renderPage();

    expect(await screen.findByText(/Chez Jean Dupont depuis le/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter CSV/i })).toBeInTheDocument();
  });

  it('affiche « déclaré non rendu » quand le dernier bon l\'indique', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1', { notReturned: true })],
      truncated: false,
      total: 1,
    });

    renderPage();

    expect(await screen.findByText('Déclaré non restitué')).toBeInTheDocument();
  });

  it('ne rend pas la référence de bon cliquable pour la direction (canLinkToBon=false)', async () => {
    authState.role = 'direction';
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1')],
      truncated: false,
      total: 1,
    });

    renderPage();

    const reference = await screen.findByText('BON-2026-0001');
    expect(reference.tagName).not.toBe('A');
  });
});
