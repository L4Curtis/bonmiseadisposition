import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { GlobalSearch } from '../GlobalSearch';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), getBlob: vi.fn(), postForm: vi.fn(), patchForm: vi.fn() },
  };
});

import { api } from '@/lib/api';

describe('GlobalSearch — équipement associé à une correspondance par n° de série', () => {
  beforeEach(() => vi.resetAllMocks());

  it('affiche l\'équipement et son n° de série quand la saisie correspond à un n° de série', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      bons: [
        {
          id: 'b1',
          reference: 'BDM-2026-001',
          status: 'active',
          collaborateur: { displayName: 'Jean Dupont', email: 'jean@livio.fr' },
          equipments: [
            { id: 'e1', serialNumber: 'SN-999888', inventoryNumber: null, customLabel: null, catalogItem: { brand: 'Dell', model: 'Latitude 5420' } },
            { id: 'e2', serialNumber: 'SN-000111', inventoryNumber: null, customLabel: null, catalogItem: null },
          ],
        },
      ],
    });

    renderWithProviders(<GlobalSearch />);
    await user.type(screen.getByLabelText('Recherche globale'), 'SN-999888');

    expect(await screen.findByText('Dell Latitude 5420')).toBeInTheDocument();
    expect(screen.getByText('SN-999888')).toBeInTheDocument();
  });

  it('affiche l\'équipement et son n° d\'inventaire quand la saisie correspond à un n° d\'inventaire', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      bons: [
        {
          id: 'b1',
          reference: 'BDM-2026-001',
          status: 'active',
          collaborateur: { displayName: 'Jean Dupont', email: 'jean@livio.fr' },
          equipments: [
            { id: 'e1', serialNumber: 'SN-999888', inventoryNumber: 'INV-4242', customLabel: null, catalogItem: { brand: 'Dell', model: 'Latitude 5420' } },
          ],
        },
      ],
    });

    renderWithProviders(<GlobalSearch />);
    await user.type(screen.getByLabelText('Recherche globale'), 'INV-4242');

    expect(await screen.findByText('Dell Latitude 5420')).toBeInTheDocument();
    expect(screen.getByText('INV-4242')).toBeInTheDocument();
  });

  it('n\'affiche aucun équipement quand la correspondance vient de la référence/du collaborateur', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      bons: [
        {
          id: 'b1',
          reference: 'BDM-2026-001',
          status: 'active',
          collaborateur: { displayName: 'Jean Dupont', email: 'jean@livio.fr' },
          equipments: [
            { id: 'e1', serialNumber: 'SN-999888', inventoryNumber: null, customLabel: null, catalogItem: { brand: 'Dell', model: 'Latitude 5420' } },
          ],
        },
      ],
    });

    renderWithProviders(<GlobalSearch />);
    await user.type(screen.getByLabelText('Recherche globale'), 'Dupont');

    await screen.findByText('Jean Dupont');
    expect(screen.queryByText('Dell Latitude 5420')).not.toBeInTheDocument();
  });
});

describe('GlobalSearch — erreur réseau vs résultat vide', () => {
  beforeEach(() => vi.resetAllMocks());

  it('affiche un message distinct en cas d\'erreur réseau', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));

    renderWithProviders(<GlobalSearch />);
    await user.type(screen.getByLabelText('Recherche globale'), 'BDM-2026');

    expect(await screen.findByRole('alert')).toHaveTextContent(/erreur réseau/i);
    expect(screen.queryByText('Aucun bon. Entrée pour la recherche complète.')).not.toBeInTheDocument();
  });

  it('affiche le message "aucun résultat" quand la recherche réussit mais ne retourne rien', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ bons: [] });

    renderWithProviders(<GlobalSearch />);
    await user.type(screen.getByLabelText('Recherche globale'), 'introuvable');

    expect(await screen.findByText('Aucun bon. Entrée pour la recherche complète.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
