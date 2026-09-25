import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TodayTab } from '../TodayTab';

const navigateMock = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

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
  navigateMock.mockReset();
  mockRole = 'technician';
});

describe('TodayTab', () => {
  it('shows the overdue threshold from /bons/stats in the tile label, and navigates on click', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/bons/stats')) {
        return Promise.resolve({
          waitingSignature: 2, active: 5, overdue: 1, total: 8,
          archivedThisMonth: 3, partiallyReturned: 0, overdueThresholdDays: 10,
          byFiliale: [{ id: 'f1', name: 'Paris', count: 4 }],
        });
      }
      if (path.startsWith('/bons/recent')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { user } = renderWithProviders(<TodayTab />);

    const overdueCard = await screen.findByRole('button', { name: /Signature en retard \(> 10 j\)/ });
    expect(overdueCard).toBeInTheDocument();

    await user.click(overdueCard);
    expect(navigateMock).toHaveBeenCalledWith('/bons?overdue=1');
  });

  it('falls back to a 7-day threshold when the backend does not send one', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/bons/stats')) {
        return Promise.resolve({
          waitingSignature: 0, active: 0, overdue: 0, total: 0,
          archivedThisMonth: 0, partiallyReturned: 0, byFiliale: [],
        });
      }
      if (path.startsWith('/bons/recent')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithProviders(<TodayTab />);
    expect(await screen.findByText('Signature en retard (> 7 j)')).toBeInTheDocument();
  });

  // ─── Départs avec matériel (lot D1) ─────────────────────────────────────────

  describe('tuile "Départs avec matériel"', () => {
    function mockApi(departureTotal: number | null) {
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.startsWith('/bons/stats')) {
          return Promise.resolve({
            waitingSignature: 0, active: 0, overdue: 0, total: 0,
            archivedThisMonth: 0, partiallyReturned: 0, byFiliale: [],
          });
        }
        if (path.startsWith('/bons/recent')) return Promise.resolve([]);
        if (path.startsWith('/reporting/inventory/by-collaborateur')) {
          return departureTotal === null
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ items: [], total: departureTotal, page: 1, limit: 1, truncated: false });
        }
        return Promise.resolve(null);
      });
    }

    it('affiche la tuile avec le nombre concerné et mène vers l\'inventaire filtré', async () => {
      mockApi(3);
      const { user } = renderWithProviders(<TodayTab />);

      const tile = await screen.findByRole('button', { name: /Départs avec matériel : 3/ });
      await user.click(tile);

      expect(navigateMock).toHaveBeenCalledWith('/inventaire?vue=collaborateurs&compte=inactif');
    });

    it("n'affiche pas la tuile quand aucun collaborateur n'est concerné", async () => {
      mockApi(0);
      renderWithProviders(<TodayTab />);

      // Attend la fin du chargement des tuiles avant de vérifier l'absence.
      await screen.findByRole('button', { name: /Bons ouverts/ });
      expect(screen.queryByText('Départs avec matériel')).not.toBeInTheDocument();
    });

    it("n'affiche pas la tuile quand la ressource échoue à charger (pas d'alerte fausse)", async () => {
      mockApi(null);
      renderWithProviders(<TodayTab />);

      await screen.findByRole('button', { name: /Bons ouverts/ });
      expect(screen.queryByText('Départs avec matériel')).not.toBeInTheDocument();
    });
  });

  // ─── Bloc « À traiter aujourd'hui » (lot E1) ────────────────────────────────

  describe('bloc "À traiter aujourd\'hui"', () => {
    const baseStats = {
      waitingSignature: 0, active: 0, overdue: 0, total: 0,
      archivedThisMonth: 0, partiallyReturned: 0, byFiliale: [],
    };

    function mockApi({
      drafts = { bons: [], total: 0 },
      overdue = { bons: [], total: 0 },
      active = { bons: [], total: 0 },
    }: {
      drafts?: { bons: unknown[]; total: number };
      overdue?: { bons: unknown[]; total: number };
      active?: { bons: unknown[]; total: number };
    }) {
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.startsWith('/bons/stats')) return Promise.resolve(baseStats);
        if (path.startsWith('/bons/recent')) return Promise.resolve([]);
        if (path.startsWith('/bons?status=draft')) return Promise.resolve(drafts);
        if (path.startsWith('/bons?overdue=1')) return Promise.resolve(overdue);
        if (path.startsWith('/bons?status=active')) return Promise.resolve(active);
        return Promise.resolve(null);
      });
    }

    it('liste chaque catégorie avec son action et navigue vers le bon ou la liste filtrée', async () => {
      const oldDraft = {
        id: 'draft-1', reference: 'BON-D1', collaborateur: { displayName: 'Alice Martin' },
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', dateRestitution: null,
      };
      const overdueSignature = {
        id: 'sig-1', reference: 'BON-S1', collaborateur: { displayName: 'Bob Dupont' },
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z', dateRestitution: null,
      };
      const overdueReturn = {
        id: 'ret-1', reference: 'BON-R1', collaborateur: { displayName: 'Chloé Petit' },
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
        dateRestitution: '2020-01-05T00:00:00.000Z',
      };
      mockApi({
        drafts: { bons: [oldDraft], total: 2 },
        overdue: { bons: [overdueSignature], total: 5 },
        active: { bons: [overdueReturn], total: 1 },
      });

      const { user } = renderWithProviders(<TodayTab />);

      expect(await screen.findByText('Brouillons jamais envoyés')).toBeInTheDocument();
      expect(screen.getByText('Signatures en attente')).toBeInTheDocument();
      expect(screen.getByText('Restitutions en retard')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /BON-D1/ }));
      expect(navigateMock).toHaveBeenCalledWith('/bons/draft-1');

      await user.click(screen.getByRole('button', { name: 'Voir tout (2)' }));
      expect(navigateMock).toHaveBeenCalledWith('/bons?status=draft');

      await user.click(screen.getByRole('button', { name: 'Voir tout (5)' }));
      expect(navigateMock).toHaveBeenCalledWith('/bons?overdue=1');

      await user.click(screen.getByRole('button', { name: 'Voir tout (1)' }));
      expect(navigateMock).toHaveBeenCalledWith('/bons?status=active');
    });

    it('masque une catégorie vide sans masquer les autres', async () => {
      const overdueSignature = {
        id: 'sig-1', reference: 'BON-S1', collaborateur: { displayName: 'Bob Dupont' },
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z', dateRestitution: null,
      };
      mockApi({ overdue: { bons: [overdueSignature], total: 1 } });

      renderWithProviders(<TodayTab />);

      expect(await screen.findByText('Signatures en attente')).toBeInTheDocument();
      expect(screen.queryByText('Brouillons jamais envoyés')).not.toBeInTheDocument();
      expect(screen.queryByText('Restitutions en retard')).not.toBeInTheDocument();
    });

    it('affiche un message rassurant quand rien ne reste à traiter', async () => {
      mockApi({});
      renderWithProviders(<TodayTab />);

      expect(await screen.findByText("Rien à traiter aujourd'hui")).toBeInTheDocument();
      expect(screen.queryByText('Brouillons jamais envoyés')).not.toBeInTheDocument();
    });
  });

  // ─── Alerte tâches planifiées (lot E3) ──────────────────────────────────────

  describe('alerte "Tâches planifiées"', () => {
    const baseStats = {
      waitingSignature: 0, active: 0, overdue: 0, total: 0,
      archivedThisMonth: 0, partiallyReturned: 0, byFiliale: [],
    };

    function mockApi(adminStatus: unknown) {
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.startsWith('/bons/stats')) return Promise.resolve(baseStats);
        if (path.startsWith('/bons/recent')) return Promise.resolve([]);
        if (path.startsWith('/bons?')) return Promise.resolve({ bons: [], total: 0 });
        if (path.startsWith('/admin/status')) {
          return adminStatus instanceof Error ? Promise.reject(adminStatus) : Promise.resolve(adminStatus);
        }
        return Promise.resolve(null);
      });
    }

    it('signale une tâche en erreur à un administrateur, avec un lien vers le monitoring', async () => {
      mockRole = 'admin';
      mockApi({
        version: 'dev', commit: 'dev', uptimeSeconds: 10, database: 'ok',
        jobs: [{
          job: 'rappels', label: 'Rappels', schedule: '0 8 * * *',
          lastStartedAt: null, lastFinishedAt: null, lastStatus: 'error', lastError: 'boom',
          lastDurationMs: null, late: false,
        }],
      });

      renderWithProviders(<TodayTab />);

      expect(await screen.findByText(/tâche\(s\) planifiée\(s\) en erreur/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voir le monitoring' })).toHaveAttribute('href', '/admin/configuration/monitoring');
    });

    it("n'affiche rien quand toutes les tâches vont bien", async () => {
      mockRole = 'admin';
      mockApi({
        version: 'dev', commit: 'dev', uptimeSeconds: 10, database: 'ok',
        jobs: [{
          job: 'rappels', label: 'Rappels', schedule: '0 8 * * *',
          lastStartedAt: null, lastFinishedAt: null, lastStatus: 'success', lastError: null,
          lastDurationMs: 12, late: false,
        }],
      });

      renderWithProviders(<TodayTab />);

      await screen.findByRole('button', { name: /Bons ouverts/ });
      expect(screen.queryByRole('link', { name: 'Voir le monitoring' })).not.toBeInTheDocument();
    });

    it("n'appelle jamais /admin/status pour un technicien, et n'affiche rien", async () => {
      mockRole = 'technician';
      mockApi({
        version: 'dev', commit: 'dev', uptimeSeconds: 10, database: 'ok',
        jobs: [{
          job: 'rappels', label: 'Rappels', schedule: '0 8 * * *',
          lastStartedAt: null, lastFinishedAt: null, lastStatus: 'error', lastError: 'boom',
          lastDurationMs: null, late: false,
        }],
      });

      renderWithProviders(<TodayTab />);

      await screen.findByRole('button', { name: /Bons ouverts/ });
      expect(screen.queryByRole('link', { name: 'Voir le monitoring' })).not.toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/admin/status'));
    });

    it("reste silencieuse (pas de crash, pas d'alerte) si /admin/status échoue (ex. 403)", async () => {
      mockRole = 'admin';
      mockApi(new Error('Forbidden'));

      renderWithProviders(<TodayTab />);

      await screen.findByRole('button', { name: /Bons ouverts/ });
      expect(screen.queryByRole('link', { name: 'Voir le monitoring' })).not.toBeInTheDocument();
    });
  });
});
