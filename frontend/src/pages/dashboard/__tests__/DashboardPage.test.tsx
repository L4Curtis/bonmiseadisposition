import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/kpi/aujourdhui')) return Promise.resolve(todayFixture());
    if (path.startsWith('/bons/recent')) return Promise.resolve([]);
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

  describe('liste d’un chiffre (?liste=…)', () => {
    const listResponse = {
      indicateur: 'bons_annules',
      period: { from: '2026-08-27', to: '2026-09-25' },
      items: [{
        id: 'b1', bonId: 'b1', reference: 'BON-2026-0012', status: 'cancelled', collaborateur: 'Léa Martin',
        filiale: 'Bâtir Nord', at: '2026-09-20T08:30:00.000Z', detail: 'Doublon',
      }],
      total: 1, page: 1, limit: 50,
    };

    beforeEach(() => {
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
