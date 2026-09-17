import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { Sidebar } from '../Sidebar';

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

let mockRole = 'direction';

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

let mockView: 'direction' | 'technicien' | 'administrateur' | 'collaborateur' = 'direction';

vi.mock('@/contexts/UiViewContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/UiViewContext')>();
  return {
    ...actual,
    useUiView: () => ({ activeView: mockView, setActiveView: vi.fn(), availableViews: [mockView] }),
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  mockRole = 'direction';
  mockView = 'direction';
  vi.mocked(api.get).mockResolvedValue(null);
});

describe('Sidebar', () => {
  it('vue direction : 2 entrées (Tableau de bord, Inventaire), pas de Reporting', async () => {
    renderWithProviders(<Sidebar />);

    expect(await screen.findByRole('link', { name: /Tableau de bord/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Inventaire/i })).toBeInTheDocument();
    expect(screen.queryByText(/Reporting/i)).not.toBeInTheDocument();
  });

  it('vue technicien : badge "3" sur Contestations quand /contestations renvoie openCount 3', async () => {
    mockRole = 'technician';
    mockView = 'technicien';
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/contestations')) {
        return Promise.resolve({ contestations: [], total: 0, page: 1, limit: 1, openCount: 3 });
      }
      return Promise.resolve(null);
    });

    renderWithProviders(<Sidebar />);

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/contestations'));
  });

  it('vue direction : aucun appel à /contestations (rôle non-IT)', async () => {
    renderWithProviders(<Sidebar />);

    await screen.findByRole('link', { name: /Tableau de bord/i });
    expect(api.get).not.toHaveBeenCalled();
  });
});
