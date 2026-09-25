import { afterEach, describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { APP_NAME, documentTitle, usePageTitle } from '../usePageTitle';

function RouteTitle({ title, children }: { title: string | null; children?: ReactNode }) {
  usePageTitle(title, 'route');
  return <>{children}</>;
}

function PageTitle({ title }: { title: string | null }) {
  usePageTitle(title);
  return null;
}

afterEach(() => {
  document.title = '';
});

describe('documentTitle', () => {
  it('suit le modèle « Inventaire · Bons IT »', () => {
    expect(documentTitle('Inventaire')).toBe('Inventaire · Bons IT');
    expect(APP_NAME).toBe('Bons IT');
  });

  it('sans titre : le nom de l’application seul', () => {
    expect(documentTitle(null)).toBe('Bons IT');
    expect(documentTitle('  ')).toBe('Bons IT');
  });
});

describe('usePageTitle', () => {
  it('donne son titre à l’onglet', () => {
    render(<PageTitle title="Inventaire" />);
    expect(document.title).toBe('Inventaire · Bons IT');
  });

  it('le titre précis d’une page l’emporte sur celui déduit de la route', () => {
    render(
      <RouteTitle title="Bon">
        <PageTitle title="BON-2026-0030" />
      </RouteTitle>,
    );
    expect(document.title).toBe('BON-2026-0030 · Bons IT');
  });

  it('suit un changement de titre (fiche chargée après coup)', () => {
    function Fiche() {
      const [reference, setReference] = useState<string | null>(null);
      usePageTitle(reference);
      return <button type="button" onClick={() => setReference('BON-1')}>charger</button>;
    }
    const { getByRole } = render(<RouteTitle title="Bon"><Fiche /></RouteTitle>);
    expect(document.title).toBe('Bon · Bons IT');
    act(() => getByRole('button').click());
    expect(document.title).toBe('BON-1 · Bons IT');
  });

  it('au démontage de la page, le titre de la route revient', () => {
    function Harness({ showPage }: { showPage: boolean }) {
      return <RouteTitle title="Bons">{showPage && <PageTitle title="Détail" />}</RouteTitle>;
    }
    const { rerender } = render(<Harness showPage />);
    expect(document.title).toBe('Détail · Bons IT');
    rerender(<Harness showPage={false} />);
    expect(document.title).toBe('Bons · Bons IT');
  });
});
