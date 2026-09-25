import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortableHeader } from '../SortableHeader';

type Field = 'reference' | 'createdAt';

function renderHeader(sort: { field: Field; order: 'asc' | 'desc' }, toggleSort = vi.fn()) {
  render(
    <table>
      <thead>
        <tr>
          <SortableHeader field="reference" label="Référence" sort={{ ...sort, toggleSort }} />
          <SortableHeader field="createdAt" label="Créé le" sort={{ ...sort, toggleSort }} />
        </tr>
      </thead>
    </table>,
  );
  return { toggleSort };
}

describe('SortableHeader', () => {
  it('indique le sens du tri aux lecteurs d’écran (aria-sort)', () => {
    renderHeader({ field: 'reference', order: 'asc' });
    expect(screen.getByRole('columnheader', { name: /Référence/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Créé le/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('décroissant', () => {
    renderHeader({ field: 'createdAt', order: 'desc' });
    expect(screen.getByRole('columnheader', { name: /Créé le/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('un vrai bouton : trie au clavier comme à la souris', async () => {
    const { toggleSort } = renderHeader({ field: 'reference', order: 'asc' });
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Créé le' }).focus();
    await user.keyboard('{Enter}');
    expect(toggleSort).toHaveBeenCalledWith('createdAt');
  });
});
