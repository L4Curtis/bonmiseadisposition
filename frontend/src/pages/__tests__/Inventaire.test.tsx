import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
import { InventairePage } from '../Inventaire';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getBlob: vi.fn(),
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';

let mockRole = 'technician';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      role: mockRole,
      displayName: 'Test User',
      email: 't@example.com',
      isItStaff: mockRole === 'admin' || mockRole === 'technician',
      isLocalAccount: true,
      mustChangePassword: false,
      active: true,
      samAccountName: 'test',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

const summary = {
  total: 10,
  byCategory: [{ category: 'pc_portable', label: 'PC portable', count: 6 }],
  byFiliale: [{ filialeId: 'f1', name: 'Paris', count: 10 }],
  bySituation: [
    { situation: 'en_attente_signature', label: 'En attente de signature', count: 3 },
    { situation: 'en_circulation', label: 'En circulation', count: 7 },
    { situation: 'en_litige', label: 'En litige', count: 0 },
  ],
  overdue: 2,
};

const listResponse = {
  items: [
    {
      equipmentId: 'e1',
      label: 'Latitude 5540',
      category: 'pc_portable',
      serialNumber: 'SN1',
      inventoryNumber: null,
      bonId: 'b1',
      bonReference: 'BMD-2026-0001',
      bonStatus: 'active',
      situation: 'en_circulation',
      situationLabel: 'En circulation',
      dateMiseDisposition: '2026-08-01T00:00:00.000Z',
      dateRestitution: null,
      collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com', department: null },
      filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' },
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

const collaborateurResponse = {
  items: [
    {
      collaborateurId: 'u1',
      displayName: 'Jean Dupont',
      email: 'jean@example.com',
      department: null,
      filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' },
      count: 3,
      overdueCount: 1,
      oldestDateMiseDisposition: '2026-01-01T00:00:00.000Z',
      oldestAgeDays: 260,
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

function mockApiGet() {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/reporting/inventory/summary')) return Promise.resolve(summary);
    if (path.startsWith('/reporting/inventory/by-collaborateur')) return Promise.resolve(collaborateurResponse);
    if (path.startsWith('/reporting/inventory')) return Promise.resolve(listResponse);
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  mockRole = 'technician';
  mockApiGet();
});

describe('InventairePage', () => {
  it('affiche les tuiles de résumé et le tableau', async () => {
    renderWithProviders(<InventairePage />);

    expect(await screen.findByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText('Équipements prêtés')).toBeInTheDocument();
    expect(screen.getByText('BMD-2026-0001')).toBeInTheDocument();
  });

  it('rend la référence de bon cliquable pour un rôle IT', async () => {
    mockRole = 'technician';
    renderWithProviders(<InventairePage />);

    const ref = await screen.findByText('BMD-2026-0001');
    expect(ref.closest('a')).toHaveAttribute('href', '/bons/b1');
  });

  it('rend la référence de bon NON cliquable pour le rôle direction', async () => {
    mockRole = 'direction';
    renderWithProviders(<InventairePage />);

    const ref = await screen.findByText('BMD-2026-0001');
    expect(ref.closest('a')).toBeNull();
  });

  it('cliquer sur la tuile « En retard de restitution » filtre la liste et affiche le chip actif', async () => {
    const { user } = renderWithProviders(<InventairePage />);
    await screen.findByText('Jean Dupont');

    await user.click(screen.getByRole('button', { name: /En retard de restitution/ }));

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls
        .map(([path]) => path as string)
        .filter((p) => p.startsWith('/reporting/inventory?'))
        .at(-1);
      expect(lastCall).toContain('overdue=1');
    });
    expect(await screen.findByText('Retards uniquement')).toBeInTheDocument();
  });

  it('cliquer sur la tuile « En attente de signature » filtre la liste sur cette situation', async () => {
    const { user } = renderWithProviders(<InventairePage />);
    await screen.findByText('Jean Dupont');

    await user.click(screen.getByRole('button', { name: /En attente de signature/ }));

    await waitFor(() => {
      const select = screen.getByLabelText('Filtrer par situation') as HTMLSelectElement;
      expect(select.value).toBe('en_attente_signature');
    });
  });

  it('met en évidence une ligne en retard avec le nombre de jours de retard', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/reporting/inventory/summary')) return Promise.resolve(summary);
      if (path.startsWith('/reporting/inventory')) {
        return Promise.resolve({
          ...listResponse,
          items: [{ ...listResponse.items[0], dateRestitution: '2020-01-01T00:00:00.000Z' }],
        });
      }
      if (path.startsWith('/filiales/active')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithProviders(<InventairePage />);

    expect(await screen.findByText(/Retard \d+ j/)).toBeInTheDocument();
  });

  it('bascule vers la vue « Par collaborateur » au clic et charge le regroupement', async () => {
    const { user } = renderWithProviders(<InventairePage />);
    await screen.findByText('Jean Dupont');

    await user.click(screen.getByRole('tab', { name: 'Par collaborateur' }));

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls
        .map(([path]) => path as string)
        .filter((p) => p.startsWith('/reporting/inventory/by-collaborateur'))
        .at(-1);
      expect(lastCall).toBeDefined();
    });
    expect(screen.getByText('Équipements')).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
  });

  it('applique un filtre actif (retard) à la vue collaborateur', async () => {
    const { user } = renderWithProviders(<InventairePage />);
    await screen.findByText('Jean Dupont');

    await user.click(screen.getByRole('tab', { name: 'Par collaborateur' }));
    await waitFor(() => screen.getByText('Équipements'));

    await user.click(screen.getByRole('button', { name: /En retard de restitution/ }));

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls
        .map(([path]) => path as string)
        .filter((p) => p.startsWith('/reporting/inventory/by-collaborateur'))
        .at(-1);
      expect(lastCall).toContain('overdue=1');
    });
  });

  it('conserve la vue "collaborateurs" au rechargement (état vécu dans l\'URL)', async () => {
    renderWithProviders(<InventairePage />, { route: '/inventaire?vue=collaborateurs' });

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls
        .map(([path]) => path as string)
        .filter((p) => p.startsWith('/reporting/inventory/by-collaborateur'))
        .at(-1);
      expect(lastCall).toBeDefined();
    });
    expect(screen.getByRole('tab', { name: 'Par collaborateur' })).toHaveAttribute('data-state', 'active');
  });

  it('précise que l\'export CSV reste au détail par équipement quand la vue collaborateur est active', async () => {
    const { user } = renderWithProviders(<InventairePage />);
    await screen.findByText('Jean Dupont');

    await user.click(screen.getByRole('tab', { name: 'Par collaborateur' }));

    expect(await screen.findByText(/Export au détail par équipement, filtres actifs\./)).toBeInTheDocument();
  });
});
