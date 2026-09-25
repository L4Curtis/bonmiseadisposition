import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
import App from '../../App';

// jsdom n'implémente pas matchMedia (ThemeProvider, affichage mobile des listes).
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

vi.setConfig({ testTimeout: 30000 });

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
      getFile: vi.fn(),
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';

type Role = 'admin' | 'technician' | 'direction' | 'collaborator';
let mockUser: Record<string, unknown> | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: mockUser, loading: false, refetch: vi.fn(), logout: vi.fn() }),
}));

function userWithRole(role: Role) {
  return {
    id: `u-${role}`,
    role,
    displayName: `Compte ${role}`,
    email: `${role}@example.com`,
    isItStaff: role === 'admin' || role === 'technician',
    isLocalAccount: true,
    isManualAccount: false,
    mustChangePassword: false,
    active: true,
    samAccountName: role,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  localStorage.clear();
  document.title = '';
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/equipment/catalog') || path.startsWith('/equipment/packs')) return Promise.resolve([]);
    if (path.startsWith('/filiales')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

afterEach(() => {
  mockUser = null;
});

describe('Connexion avec retour à la page demandée', () => {
  it('un lien profond ouvert sans session mène à la connexion avec returnTo, transmis à Microsoft', async () => {
    mockUser = null;
    renderWithProviders(<App />, { route: '/inventaire?vue=collaborateurs&compte=inactif' });

    const sso = await screen.findByRole('link', { name: /continuer avec microsoft/i });
    // Le serveur garde cette adresse pendant l'aller-retour chez Microsoft
    // (cookie auth_return_to) et y renvoie après la connexion.
    expect(sso).toHaveAttribute(
      'href',
      '/api/auth/login?returnTo=%2Finventaire%3Fvue%3Dcollaborateurs%26compte%3Dinactif',
    );
  });

  it('l’accueil sans session mène à la connexion sans returnTo inutile', async () => {
    mockUser = null;
    renderWithProviders(<App />, { route: '/' });

    const sso = await screen.findByRole('link', { name: /continuer avec microsoft/i });
    expect(sso).toHaveAttribute('href', '/api/auth/login');
  });
});

describe('Page introuvable', () => {
  it('une adresse inconnue affiche « Page introuvable » et un lien vers l’accueil, sans redirection silencieuse', async () => {
    mockUser = userWithRole('admin');
    renderWithProviders(<App />, { route: '/nimporte/quoi' });

    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Retour à l'accueil" })).toHaveAttribute('href', '/');
    await waitFor(() => expect(document.title).toBe('Page introuvable · Bons IT'));
  });

  it('même sous /admin', async () => {
    mockUser = userWithRole('technician');
    renderWithProviders(<App />, { route: '/admin/inexistant' });

    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
  });
});

describe('Droits du technicien (décision du 24/09)', () => {
  it.each(['/admin/utilisateurs', '/admin/filiales'])('%s : accès refusé au technicien', async (route) => {
    mockUser = userWithRole('technician');
    renderWithProviders(<App />, { route });

    expect(await screen.findByText('403')).toBeInTheDocument();
  });

  it('le Catalogue reste ouvert au technicien', async () => {
    mockUser = userWithRole('technician');
    renderWithProviders(<App />, { route: '/admin/catalogue' });

    expect(await screen.findByRole('heading', { level: 1, name: /Catalogue/ })).toBeInTheDocument();
    expect(screen.queryByText('403')).not.toBeInTheDocument();
  });

  it('l’administrateur garde Filiales', async () => {
    mockUser = userWithRole('admin');
    renderWithProviders(<App />, { route: '/admin/filiales' });

    expect(await screen.findByRole('heading', { level: 1, name: /Filiales/ })).toBeInTheDocument();
    expect(screen.queryByText('403')).not.toBeInTheDocument();
  });
});

describe('Titre de l’onglet', () => {
  it('dérivé de la route : « Catalogue · Bons IT »', async () => {
    mockUser = userWithRole('admin');
    renderWithProviders(<App />, { route: '/admin/catalogue' });

    await waitFor(() => expect(document.title).toBe('Catalogue · Bons IT'));
  });
});
