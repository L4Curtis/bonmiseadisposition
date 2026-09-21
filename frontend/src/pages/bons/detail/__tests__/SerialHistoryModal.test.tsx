import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { SerialHistoryModal } from '../SerialHistoryModal';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from '@/lib/api';

/**
 * Régression : GET /equipment/serial-history renvoie une ENVELOPPE
 * ({ items, truncated, total }), pas un tableau. La modale lisait la réponse
 * comme un tableau et plantait (« entries.filter is not a function ») au
 * premier clic sur un numéro de série.
 */
function entree(reference: string, bonId: string) {
  return {
    equipmentId: `e-${bonId}`,
    serialNumber: 'SN-123',
    label: 'Laptop',
    returnedAt: null,
    notReturned: false,
    bon: {
      id: bonId,
      reference,
      status: 'active',
      dateMiseDisposition: '2026-01-05T00:00:00.000Z',
      collaborateur: { displayName: 'Jean Dupont', email: 'jean@x.fr' },
      filiale: { displayName: 'Siège' },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SerialHistoryModal', () => {
  it('affiche les bons renvoyés dans items', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1'), entree('BON-2026-0002', 'b2')],
      truncated: false,
      total: 2,
    });

    renderWithProviders(<SerialHistoryModal serialNumber="SN-123" onClose={vi.fn()} />);

    expect(await screen.findByText('BON-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('BON-2026-0002')).toBeInTheDocument();
  });

  it('signale un historique tronqué avec le compte réel', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1')],
      truncated: true,
      total: 250,
    });

    renderWithProviders(<SerialHistoryModal serialNumber="SN-123" onClose={vi.fn()} />);

    expect(await screen.findByText(/sur 250/)).toBeInTheDocument();
  });

  it('affiche l’état vide quand le seul bon est celui d’où la modale est ouverte', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [entree('BON-2026-0001', 'b1')],
      truncated: false,
      total: 1,
    });

    renderWithProviders(
      <SerialHistoryModal serialNumber="SN-123" currentBonId="b1" onClose={vi.fn()} />,
    );

    expect(await screen.findByText(/Aucun autre bon ne référence/i)).toBeInTheDocument();
  });

  it('affiche une erreur lisible quand l’appel échoue', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Erreur HTTP 500'));

    renderWithProviders(<SerialHistoryModal serialNumber="SN-123" onClose={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur HTTP 500');
  });
});
