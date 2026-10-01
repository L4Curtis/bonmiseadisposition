import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { MobileSearch } from '../MobileSearch';

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

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="adresse">{pathname + search}</p>;
}

function renderSearch() {
  return renderWithProviders(
    <>
      <MobileSearch />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </>,
    { route: '/dashboard' },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({
    items: [
      {
        id: 'b7',
        reference: 'BON-2026-0007',
        status: 'active',
        collaborateur: { displayName: 'Léa Martin', email: 'lea@example.com' },
        equipments: [],
      },
    ],
  });
});

afterEach(() => {
  window.history.replaceState(null, '');
});

describe('Recherche du téléphone (loupe)', () => {
  it('la loupe ouvre la recherche en plein écran, champ prêt à la frappe et sans zoom iOS', async () => {
    const { user } = renderSearch();

    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByRole('dialog', { name: 'Recherche' })).toBeInTheDocument();
    const champ = screen.getByRole('searchbox', { name: 'Recherche globale' });
    await waitFor(() => expect(champ).toHaveFocus());
    expect(champ).toHaveAttribute('enterkeyhint', 'search');
    expect(champ.className).toMatch(/\btext-base\b/);
  });

  it('choisir un résultat ouvre le bon et ferme la recherche', async () => {
    const { user } = renderSearch();
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    await user.type(await screen.findByRole('searchbox', { name: 'Recherche globale' }), 'Léa');
    await user.click(await screen.findByText('Léa Martin'));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Recherche' })).not.toBeInTheDocument());
    expect(screen.getByTestId('adresse')).toHaveTextContent('/bons/b7');
  });

  it('la touche « Rechercher » du clavier ouvre la liste filtrée', async () => {
    const { user } = renderSearch();
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    await user.type(await screen.findByRole('searchbox', { name: 'Recherche globale' }), 'DL5450{Enter}');

    await waitFor(() => expect(screen.getByTestId('adresse')).toHaveTextContent('/bons?search=DL5450'));
    expect(screen.queryByRole('dialog', { name: 'Recherche' })).not.toBeInTheDocument();
  });

  it('se ferme avec Échap', async () => {
    const { user } = renderSearch();
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByRole('dialog', { name: 'Recherche' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Recherche' })).not.toBeInTheDocument());
    expect(screen.getByTestId('adresse')).toHaveTextContent('/dashboard');
  });

  it('le geste retour la ferme ; rouverte, elle repart d’un champ vide', async () => {
    const { user } = renderSearch();
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await user.type(await screen.findByRole('searchbox', { name: 'Recherche globale' }), 'Léa');

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Recherche' })).not.toBeInTheDocument());
    expect(screen.getByTestId('adresse')).toHaveTextContent('/dashboard');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByRole('searchbox', { name: 'Recherche globale' })).toHaveValue('');
  });
});
