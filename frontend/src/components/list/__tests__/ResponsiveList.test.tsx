import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResponsiveList, type ListColumn } from '../ResponsiveList';

interface Row {
  readonly id: string;
  readonly reference: string;
  readonly collaborateur: string;
  readonly statut: string;
}

const ROWS: readonly Row[] = [
  { id: '1', reference: 'BON-1', collaborateur: 'Alice', statut: 'En cours' },
  { id: '2', reference: 'BON-2', collaborateur: 'Bruno', statut: 'Clôturé' },
];

type Field = 'reference' | 'collaborateur';

const COLUMNS: readonly ListColumn<Row, Field>[] = [
  { key: 'reference', header: 'Référence', cell: (r) => r.reference, sortField: 'reference', card: 'title' },
  { key: 'collaborateur', header: 'Collaborateur', cell: (r) => r.collaborateur, sortField: 'collaborateur' },
  { key: 'statut', header: 'Statut', cell: (r) => r.statut },
  { key: 'actions', header: 'Actions', cell: (r) => <button type="button">Ouvrir {r.reference}</button>, card: 'actions' },
];

function mockViewport(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: /max-width:\s*767px/.test(query) ? width < 768 : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('ResponsiveList — bureau (tableau)', () => {
  it('rend un tableau nommé, une ligne par élément', () => {
    render(<ResponsiveList items={ROWS} columns={COLUMNS} getKey={(r) => r.id} caption="Liste des bons" mode="table" />);
    const table = screen.getByRole('table', { name: 'Liste des bons' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('columnheader', { name: 'Statut' })).toBeInTheDocument();
  });

  it('les colonnes triables deviennent des en-têtes triables', async () => {
    const toggleSort = vi.fn();
    render(
      <ResponsiveList
        items={ROWS}
        columns={COLUMNS}
        getKey={(r) => r.id}
        caption="Liste des bons"
        mode="table"
        sort={{ field: 'reference', order: 'asc', toggleSort, setSort: vi.fn() }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Référence/ })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collaborateur' }));
    expect(toggleSort).toHaveBeenCalledWith('collaborateur');
  });

  it('mode automatique sur grand écran : tableau', () => {
    mockViewport(1280);
    render(<ResponsiveList items={ROWS} columns={COLUMNS} getKey={(r) => r.id} caption="Liste des bons" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('ResponsiveList — téléphone (cartes)', () => {
  it('sous 768 px, chaque ligne devient une carte', () => {
    mockViewport(375);
    render(<ResponsiveList items={ROWS} columns={COLUMNS} getKey={(r) => r.id} caption="Liste des bons" />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Liste des bons' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
  });

  it('une carte : le titre en tête, les autres colonnes en « libellé : valeur », les actions en bas', () => {
    render(<ResponsiveList items={ROWS} columns={COLUMNS} getKey={(r) => r.id} caption="Liste des bons" mode="cards" />);
    const [first] = screen.getAllByRole('listitem');
    expect(within(first).getByRole('heading', { name: 'BON-1' })).toBeInTheDocument();
    expect(within(first).getByText('Collaborateur')).toBeInTheDocument();
    expect(within(first).getByText('Alice')).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Ouvrir BON-1' })).toBeInTheDocument();
    // La colonne « Actions » n'a pas d'étiquette dans la carte.
    expect(within(first).queryByText('Actions')).not.toBeInTheDocument();
  });

  it('le tri reste possible sans en-têtes de colonne', async () => {
    const setSort = vi.fn();
    render(
      <ResponsiveList
        items={ROWS}
        columns={COLUMNS}
        getKey={(r) => r.id}
        caption="Liste des bons"
        mode="cards"
        sort={{ field: 'reference', order: 'asc', toggleSort: vi.fn(), setSort }}
      />,
    );
    await userEvent.setup().selectOptions(screen.getByLabelText('Trier par'), 'collaborateur:desc');
    expect(setSort).toHaveBeenCalledWith('collaborateur', 'desc');
  });

  it('une carte sur mesure remplace la carte par défaut', () => {
    render(
      <ResponsiveList
        items={ROWS}
        columns={COLUMNS}
        getKey={(r) => r.id}
        caption="Liste des bons"
        mode="cards"
        renderCard={(r) => <p>Carte {r.reference}</p>}
      />,
    );
    expect(screen.getByText('Carte BON-2')).toBeInTheDocument();
  });
});
