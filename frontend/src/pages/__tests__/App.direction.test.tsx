import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import App from '../../App';

// jsdom n'implémente pas window.matchMedia (utilisé par ThemeProvider, monté
// ici pour la première fois dans la suite puisque ce test rend <App/> en
// entier plutôt qu'une page isolée). Stub minimal, propre à ce fichier.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

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

interface MockUser {
  id: string;
  role: string;
  displayName: string;
  email: string;
  isItStaff: boolean;
  isLocalAccount: boolean;
  mustChangePassword: boolean;
  active: boolean;
  samAccountName: string;
}

let mockUser: MockUser | null = null;

// AuthContext réel : le vrai AuthProvider ferait un fetch('/api/auth/me') non
// mocké ici. On remplace tout le module — UiViewProvider (réel, non mocké)
// consomme le même useAuth() et calcule donc les vues disponibles à partir
// du rôle mocké, exactement comme en production.
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    user: mockUser,
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

function directionUser(): MockUser {
  return {
    id: 'u-direction',
    role: 'direction',
    displayName: 'Dana Direction',
    email: 'direction@example.com',
    isItStaff: false,
    isLocalAccount: true,
    mustChangePassword: false,
    active: true,
    samAccountName: 'ddirection',
  };
}

function adminUser(): MockUser {
  return {
    id: 'u-admin',
    role: 'admin',
    displayName: 'Alice Admin',
    email: 'admin@example.com',
    isItStaff: true,
    isLocalAccount: true,
    mustChangePassword: false,
    active: true,
    samAccountName: 'aadmin',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/bons/stats')) {
      return Promise.resolve({
        waitingSignature: 0, active: 0, overdue: 0, total: 0,
        archivedThisMonth: 0, partiallyReturned: 0, byFiliale: [],
      });
    }
    if (path.startsWith('/bons/recent')) return Promise.resolve([]);
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

describe('App — rôle direction', () => {
  it('"/" arrive sur le tableau de bord, onglet Parc actif, sans onglet "Aujourd\'hui" ni bouton "Nouveau bon"', async () => {
    mockUser = directionUser();
    renderWithProviders(<App />, { route: '/' });

    // Timeout élargi : rendu de l'app complète (lazy imports + plusieurs
    // providers), plus lent qu'une page isolée sous charge parallèle.
    expect(await screen.findByRole('tab', { name: 'Parc' }, { timeout: 3000 })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByRole('tab', { name: "Aujourd'hui" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouveau bon/i })).not.toBeInTheDocument();
  });

  it('refuse l\'accès à /bons (page « Accès refusé »)', async () => {
    mockUser = directionUser();
    renderWithProviders(<App />, { route: '/bons' });

    expect(await screen.findByText('403')).toBeInTheDocument();
    expect(screen.getByText(/pas accès à cette page/i)).toBeInTheDocument();
  });

  it('refuse l\'accès à /admin (page « Accès refusé »)', async () => {
    mockUser = directionUser();
    renderWithProviders(<App />, { route: '/admin' });

    expect(await screen.findByText('403')).toBeInTheDocument();
  });
});

describe('App — redirection /admin/reports', () => {
  it('un admin qui accède à /admin/reports arrive sur /dashboard?tab=parc', async () => {
    mockUser = adminUser();
    renderWithProviders(<App />, { route: '/admin/reports' });

    // L'onglet Parc actif prouve que la redirection vers le nouveau tableau
    // de bord (fusion de l'ex-page Reporting) a bien eu lieu.
    expect(await screen.findByRole('tab', { name: 'Parc' }, { timeout: 3000 })).toHaveAttribute('data-state', 'active');
  });
});
