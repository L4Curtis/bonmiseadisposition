import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
import { DashboardPage } from '../DashboardPage';
import { todayFixture } from './kpi-fixtures';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      getList: vi.fn(),
      getFile: vi.fn(),
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

// Le téléchargement lui-même (lien temporaire) n'existe pas dans jsdom.
vi.mock('@/lib/download', () => ({ saveBlob: vi.fn() }));

import { api } from '@/lib/api';

let mockRole = 'admin';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      role: mockRole,
      displayName: 'Test User',
      email: 't@example.com',
      isItStaff: true,
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

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  mockRole = 'admin';
  // Les listes passent par `getList` ; les réponses sont décrites par `get`.
  vi.mocked(api.getList).mockImplementation((path: string) => api.get(path));
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/bons?')) return Promise.resolve({ items: [], total: 0, page: 1, limit: 25, truncated: false });
    if (path.startsWith('/kpi/aujourdhui')) return Promise.resolve(todayFixture());
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

describe('DashboardPage', () => {
  it('shows all 4 tabs for an admin, with "Aujourd\'hui" active by default', async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('tab', { name: "Aujourd'hui" })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Parc' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Délais' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Incidents' })).toBeInTheDocument();

    // Laisse les appels de TodayTab se résoudre pour ne pas terminer le test
    // avec une mise à jour d'état en attente.
    await screen.findByText('Signatures attendues');
  });

  it('selects "Délais" when ?tab=delais is present in the URL', async () => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard?tab=delais' });
    expect(await screen.findByRole('tab', { name: 'Délais' })).toHaveAttribute('data-state', 'active');
  });

  it('hides "Aujourd\'hui" and defaults to "Parc" for a non-IT / unknown role', async () => {
    mockRole = 'collaborator';
    renderWithProviders(<DashboardPage />);

    expect(screen.queryByRole('tab', { name: "Aujourd'hui" })).not.toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Parc' })).toHaveAttribute('data-state', 'active');
  });

  it('sous-titre : « à traiter » pour l’IT seulement, pas pour la direction', async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Ce qui est à traiter, le parc prêté et les délais')).toBeInTheDocument();
    await screen.findByText('Signatures attendues');
  });

  it('direction : un sous-titre sans « à traiter »', async () => {
    mockRole = 'direction';
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Le parc prêté, les délais et les incidents')).toBeInTheDocument();
    expect(screen.queryByText(/à traiter, le parc/)).not.toBeInTheDocument();
  });

  describe('« Exporter ces indicateurs » (un export par onglet)', () => {
    beforeEach(() => {
      mockRole = 'direction';
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.startsWith('/filiales/active')) return Promise.resolve([{ id: 'f1', name: 'nord', displayName: 'Bâtir Nord' }]);
        return new Promise(() => {});
      });
      vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['a']), filename: 'indicateurs.csv', truncated: false });
    });

    it.each([
      ['parc', 'Parc'],
      ['delais', 'Délais'],
      ['incidents', 'Incidents'],
    ])('onglet %s : annonce l’onglet, la période et la filiale, puis exporte avec elles', async (tab, label) => {
      const { user } = renderWithProviders(<DashboardPage />, {
        route: `/dashboard?tab=${tab}&from=2026-08-27&to=2026-09-25&filialeId=f1`,
      });

      await user.click(await screen.findByRole('button', { name: 'Exporter ces indicateurs' }));
      const dialog = await screen.findByRole('dialog');
      await waitFor(() => expect(dialog).toHaveTextContent(
        `Filtres : Onglet : ${label} ; Période : du 27/08/2026 au 25/09/2026 ; Filiale : Bâtir Nord`,
      ));
      expect(api.getFile).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: /^Exporter$/ }));
      await waitFor(() => expect(api.getFile).toHaveBeenCalledWith(
        `/kpi/${tab}/export?from=2026-08-27&to=2026-09-25&filialeId=f1`,
      ));
    });

    it('« Aujourd’hui » n’a pas d’export d’indicateurs', async () => {
      mockRole = 'admin';
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.startsWith('/kpi/aujourdhui')) return Promise.resolve(todayFixture());
            if (path.startsWith('/filiales/active')) return Promise.resolve([]);
        return Promise.resolve(null);
      });
      renderWithProviders(<DashboardPage />);
      await screen.findByText('Signatures attendues');
      expect(screen.queryByRole('button', { name: 'Exporter ces indicateurs' })).not.toBeInTheDocument();
    });
  });

  describe('liste d’un chiffre (?liste=…)', () => {
    const listResponse = {
      items: [{
        id: 'b1', bonId: 'b1', reference: 'BON-2026-0012', status: 'cancelled', collaborateur: 'Léa Martin',
        filiale: 'Bâtir Nord', at: '2026-09-20T08:30:00.000Z', detail: 'Doublon',
      }],
      total: 1, page: 1, limit: 50, truncated: false,
      meta: { indicateur: 'bons_annules', period: { from: '2026-08-27', to: '2026-09-25' } },
    };

    beforeEach(() => {
      // La liste passe par `getList` ; les réponses sont décrites par `get`.
      vi.mocked(api.getList).mockImplementation((path: string) => api.get(path));
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.startsWith('/kpi/liste')) return Promise.resolve(listResponse);
        if (path.startsWith('/filiales/active')) return Promise.resolve([]);
        return new Promise(() => {});
      });
    });

    it('IT : ouvre la liste pour la même période et la même filiale ; chaque ligne mène à son bon', async () => {
      renderWithProviders(<DashboardPage />, {
        route: '/dashboard?tab=incidents&from=2026-08-27&to=2026-09-25&filialeId=f1&liste=bons_annules',
      });
      const dialog = await screen.findByRole('dialog', { name: 'Bons annulés' });
      expect(dialog).toHaveTextContent('1 bon, du 27/08 au 25/09');
      expect(dialog).toHaveTextContent('Léa Martin');
      expect(dialog).toHaveTextContent('Doublon');
      expect(screen.getByRole('link', { name: 'Ouvrir le bon BON-2026-0012' })).toHaveAttribute('href', '/bons/b1');
      expect(api.get).toHaveBeenCalledWith(
        '/kpi/liste?indicateur=bons_annules&from=2026-08-27&to=2026-09-25&page=1&limit=50&filialeId=f1',
      );
    });

    it('direction : jamais de liste de bons, même par l’adresse', async () => {
      mockRole = 'direction';
      renderWithProviders(<DashboardPage />, { route: '/dashboard?tab=incidents&liste=bons_annules' });
      expect(await screen.findByRole('tab', { name: 'Incidents' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(vi.mocked(api.get).mock.calls.some(([p]) => String(p).startsWith('/kpi/liste'))).toBe(false);
    });

    it('un indicateur inconnu n’ouvre rien', async () => {
      renderWithProviders(<DashboardPage />, { route: '/dashboard?tab=delais&liste=bons_perdus' });
      expect(await screen.findByRole('tab', { name: 'Délais' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
