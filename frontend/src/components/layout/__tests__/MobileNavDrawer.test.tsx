import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';

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

let mockView: 'direction' | 'technicien' | 'administrateur' | 'collaborateur' = 'technicien';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      role: 'technician',
      displayName: 'Julie Moreau',
      email: 'julie@example.com',
      isItStaff: true,
      isLocalAccount: true,
      mustChangePassword: false,
      active: true,
      samAccountName: 'julie',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/contexts/UiViewContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/UiViewContext')>();
  return {
    ...actual,
    useUiView: () => ({ activeView: mockView, setActiveView: vi.fn(), availableViews: [mockView] }),
  };
});

import { SCREEN_LABELS } from '@/domain/labels';
import { Layout } from '../Layout';

/** Affiche l'adresse courante : on vérifie qu'une navigation a bien eu lieu. */
function Page({ name }: { name: string }) {
  const { pathname } = useLocation();
  return (
    <div>
      <h1>{name}</h1>
      <p data-testid="chemin">{pathname}</p>
    </div>
  );
}

function renderShell(initial = '/dashboard') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Layout />,
        children: [
          { path: 'dashboard', element: <Page name="Accueil" /> },
          { path: 'bons', element: <Page name="Liste des bons" /> },
          { path: 'inventaire', element: <Page name="Inventaire" /> },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup(), ...view };
}

// Tiroir ouvert, Radix masque le reste de la page aux technologies d'assistance :
// on cherche le bouton ☰ y compris quand il est masqué.
const menuButton = () => screen.getByRole('button', { name: 'Ouvrir le menu', hidden: true });
const drawer = () => screen.queryByRole('dialog', { name: 'Menu' });

beforeEach(() => {
  vi.resetAllMocks();
  mockView = 'technicien';
  localStorage.clear();
  vi.mocked(api.get).mockResolvedValue(null);
});

afterEach(() => {
  // Chaque test repart d'une entrée d'historique sans marque de tiroir.
  window.history.replaceState(null, '');
});

describe('Menu en tiroir (téléphone)', () => {
  it('est fermé par défaut ; le bouton ☰ a un libellé et annonce son état', () => {
    renderShell();

    expect(drawer()).not.toBeInTheDocument();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('s’ouvre au bouton ☰, avec les libellés des entrées, et le focus entre dans le tiroir', async () => {
    const { user } = renderShell();

    await user.click(menuButton());

    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByRole('link', { name: SCREEN_LABELS.bons })).toBeVisible();
    expect(within(dialog).getByRole('link', { name: SCREEN_LABELS.inventaire })).toBeVisible();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('garde le focus dans le tiroir quand on tabule', async () => {
    const { user } = renderShell();
    await user.click(menuButton());
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });

    for (let i = 0; i < 15; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('se ferme avec Échap et rend le focus au bouton ☰', async () => {
    const { user } = renderShell();
    await user.click(menuButton());
    await screen.findByRole('dialog', { name: 'Menu' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
    await waitFor(() => expect(menuButton()).toHaveFocus());
  });

  it('se ferme au choix d’une entrée, après avoir navigué', async () => {
    const { user } = renderShell();
    await user.click(menuButton());
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });

    await user.click(within(dialog).getByRole('link', { name: SCREEN_LABELS.inventaire }));

    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
    expect(screen.getByTestId('chemin')).toHaveTextContent('/inventaire');
  });

  it('se ferme au clic hors du tiroir', async () => {
    const { user } = renderShell();
    await user.click(menuButton());
    await screen.findByRole('dialog', { name: 'Menu' });

    // Le voile qui couvre la page derrière le tiroir.
    const overlay = document.querySelector('[data-drawer-overlay]');
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay as Element);

    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
  });

  it('se ferme au geste retour sans quitter la page', async () => {
    const { user } = renderShell('/bons');
    await user.click(menuButton());
    await screen.findByRole('dialog', { name: 'Menu' });

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
    expect(screen.getByTestId('chemin')).toHaveTextContent('/bons');
  });

  it('ignore la préférence « menu réduit » : les libellés restent lisibles dans le tiroir', async () => {
    localStorage.setItem('sidebar-collapsed', 'true');
    const { user } = renderShell();

    await user.click(menuButton());

    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByText(SCREEN_LABELS.contestations)).toBeVisible();
    expect(within(dialog).getByText(SCREEN_LABELS.catalogue)).toBeVisible();
  });

  it('collaborateur : le tiroir ne propose que son portail', async () => {
    mockView = 'collaborateur';
    const { user } = renderShell();

    await user.click(menuButton());

    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getAllByRole('link')).toHaveLength(1);
  });
});
