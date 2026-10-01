import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';

// Historique réel du navigateur (BrowserRouter, comme en production) : le
// geste retour ne doit ni piéger l'utilisateur ni dupliquer des entrées.

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  const { listViaGet } = await import('@/test/api-mock');
  const get = vi.fn();
  return {
    ...actual,
    api: { get, getList: listViaGet(get), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), getBlob: vi.fn(), postForm: vi.fn(), patchForm: vi.fn() },
  };
});

import { api } from '@/lib/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', role: 'technician', displayName: 'Julie Moreau', email: 'julie@example.com', active: true },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/contexts/UiViewContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/UiViewContext')>();
  return {
    ...actual,
    useUiView: () => ({ activeView: 'technicien', setActiveView: vi.fn(), availableViews: ['technicien'] }),
  };
});

import { SCREEN_LABELS } from '@/domain/labels';
import { Layout } from '../Layout';

function Page() {
  const { pathname } = useLocation();
  return <p data-testid="chemin">{pathname}</p>;
}

/** Deux pages déjà visitées : /bons puis /dashboard (page courante). */
function renderShell() {
  window.history.replaceState(null, '', '/bons');
  window.history.pushState(null, '', '/dashboard');
  const view = render(
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="*" element={<Page />} />
        </Route>
      </Routes>
    </BrowserRouter>,
  );
  return { user: userEvent.setup(), ...view };
}

const menuButton = () => screen.getByRole('button', { name: 'Ouvrir le menu', hidden: true });
const drawer = () => screen.queryByRole('dialog', { name: 'Menu' });
const chemin = () => screen.getByTestId('chemin').textContent;

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(menuButton());
  return screen.findByRole('dialog', { name: 'Menu' });
}

async function pressBack() {
  await act(async () => {
    window.history.back();
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(api.get).mockResolvedValue(null);
});

describe('Tiroir du menu et geste retour (historique réel)', () => {
  it('ouvrir puis fermer plusieurs fois n’allonge pas l’historique ; le retour ramène à la page précédente', async () => {
    const { user } = renderShell();
    await openDrawer(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
    await waitFor(() => expect(window.history.state?.__panneauOuvert).toBeUndefined());
    const lengthAfterFirstCycle = window.history.length;

    for (let i = 0; i < 3; i += 1) {
      await openDrawer(user);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(drawer()).not.toBeInTheDocument());
      await waitFor(() => expect(window.history.state?.__panneauOuvert).toBeUndefined());
    }

    expect(window.history.length).toBe(lengthAfterFirstCycle);
    expect(chemin()).toBe('/dashboard');
    await pressBack();
    await waitFor(() => expect(chemin()).toBe('/bons'));
  });

  it('naviguer depuis le tiroir puis revenir ramène à la page d’où il a été ouvert', async () => {
    const { user } = renderShell();
    const dialog = await openDrawer(user);

    await user.click(within(dialog).getByRole('link', { name: SCREEN_LABELS.inventaire }));
    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
    expect(chemin()).toBe('/inventaire');

    await pressBack();
    await waitFor(() => expect(chemin()).toBe('/dashboard'));
    expect(drawer()).not.toBeInTheDocument();
  });

  it('choisir la page courante ferme le tiroir sans doubler l’entrée d’historique', async () => {
    const { user } = renderShell();
    const dialog = await openDrawer(user);

    await user.click(within(dialog).getByRole('link', { name: 'Vue d\'ensemble' }));
    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
    await waitFor(() => expect(window.history.state?.__panneauOuvert).toBeUndefined());
    expect(chemin()).toBe('/dashboard');

    // Un seul retour suffit pour quitter la page (pas de doublon de /dashboard).
    await pressBack();
    await waitFor(() => expect(chemin()).toBe('/bons'));
  });

  it('le geste retour ferme le tiroir, puis un second retour quitte la page', async () => {
    const { user } = renderShell();
    await openDrawer(user);

    await pressBack();
    await waitFor(() => expect(drawer()).not.toBeInTheDocument());
    expect(chemin()).toBe('/dashboard');

    await pressBack();
    await waitFor(() => expect(chemin()).toBe('/bons'));
  });
});
