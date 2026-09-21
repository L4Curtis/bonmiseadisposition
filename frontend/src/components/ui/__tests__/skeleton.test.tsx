import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../skeleton';

/**
 * Régression : le squelette rendait toujours un `div`, y compris quand il
 * remplaçait du texte à l'intérieur d'un `p` (liste des bons, pendant le
 * chargement). Le balisage était invalide — le navigateur ferme le `p` et
 * réorganise le contenu — et React émettait un avertissement à chaque rendu.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Skeleton', () => {
  it('rend un div par défaut', () => {
    const { container } = render(<Skeleton className="h-4 w-16" />);

    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it('rend un span quand on le demande', () => {
    const { container } = render(<Skeleton as="span" className="h-4 w-16" />);

    expect(container.firstElementChild?.tagName).toBe('SPAN');
  });

  it("n'émet aucun avertissement d'imbrication à l'intérieur d'un paragraphe", () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <p>
        <Skeleton as="span" className="h-4 w-16 inline-block" />
      </p>,
    );

    const imbrication = erreurs.mock.calls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('validateDOMNesting')),
    );
    expect(imbrication).toHaveLength(0);
  });
});
