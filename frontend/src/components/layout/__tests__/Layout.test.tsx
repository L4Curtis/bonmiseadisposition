import { describe, it, expect, vi, afterEach } from 'vitest';
import { lazy, useEffect, useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Link, useSearchParams } from 'react-router';

// Le menu et l'en-tête ne sont pas l'objet de ce test (ils interrogent l'API) :
// on isole le mécanisme de la zone d'attente autour des pages.
vi.mock('../Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../Header', () => ({ Header: () => null }));

import { Layout } from '../Layout';

/**
 * Régression (trouvée par les tests de bout en bout) : cliquer un lien juste
 * après avoir tapé une recherche ramenait à la liste.
 *
 * React Router 7 enchaîne les navigations dans une transition. Avec une seule
 * zone d'attente pour toute l'application, React gardait l'ancienne page
 * montée pendant le chargement de la suivante ; la recherche différée de
 * l'ancienne page se déclenchait alors, réécrivait l'adresse, et annulait la
 * navigation. La mise en page pose désormais une zone d'attente par page.
 */
function PageAvecRechercheDifferee() {
  const [, setSearchParams] = useSearchParams();
  const [saisie, setSaisie] = useState('');

  // Même schéma que l'inventaire et la liste des bons : la saisie est
  // recopiée dans l'adresse après un délai.
  useEffect(() => {
    if (!saisie) return;
    const minuterie = setTimeout(() => setSearchParams({ search: saisie }, { replace: true }), 300);
    return () => clearTimeout(minuterie);
  }, [saisie, setSearchParams]);

  return (
    <div>
      <h1>Liste</h1>
      <button type="button" onClick={() => setSaisie('SN-1')}>taper</button>
      <Link to="/materiel/SN-1">ouvrir la fiche</Link>
    </div>
  );
}

// Page chargée à la demande qui ne se résout jamais pendant le test : c'est
// exactement la fenêtre où l'ancienne page restait montée.
const PageChargeeALaDemande = lazy(() => new Promise<never>(() => {}));

afterEach(() => {
  vi.useRealTimers();
});

describe('Layout — une zone d’attente par page', () => {
  it('démonte l’ancienne page dès la navigation, sans laisser sa recherche différée réécrire l’adresse', async () => {
    vi.useFakeTimers();
    const router = createMemoryRouter(
      [
        {
          element: <Layout />,
          children: [
            { path: '/liste', element: <PageAvecRechercheDifferee /> },
            { path: '/materiel/:reference', element: <PageChargeeALaDemande /> },
          ],
        },
      ],
      { initialEntries: ['/liste'] },
    );
    render(<RouterProvider router={router} />);

    // La saisie arme la minuterie, puis on clique le lien avant son échéance.
    act(() => screen.getByRole('button', { name: 'taper' }).click());
    act(() => screen.getByRole('link', { name: 'ouvrir la fiche' }).click());

    // L'ancienne page n'est plus affichée : l'attente de la nouvelle a pris sa place.
    expect(screen.queryByRole('heading', { name: 'Liste' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de la page');

    // L'échéance de l'ancienne minuterie passe : l'adresse reste celle de la fiche.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(router.state.location.pathname).toBe('/materiel/SN-1');
  });
});
