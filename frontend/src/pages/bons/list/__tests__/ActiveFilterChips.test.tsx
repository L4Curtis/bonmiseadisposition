import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_LIST_QUERY } from '../bonsListQuery';
import { ActiveFilterChips, activeFilterChips } from '../ActiveFilterChips';

describe('pastilles des filtres venus d’un lien', () => {
  it('référence exacte et périodes du tableau de bord, en dates françaises', () => {
    const chips = activeFilterChips({
      ...DEFAULT_LIST_QUERY,
      reference: 'BON-2026-0042',
      createdFrom: '2026-09-01',
      createdTo: '2026-09-30',
      closedFrom: '2026-09-15',
      closedTo: '2026-09-15',
      cancelledFrom: '2026-09-01',
    }, false);
    expect(chips.map((c) => c.label)).toEqual([
      'Bon BON-2026-0042',
      'Créés du 01/09/2026 au 30/09/2026',
      'Clôturés le 15/09/2026',
      'Annulés depuis le 01/09/2026',
    ]);
  });

  it('statuts exclus seulement hors de l’option « En cours »', () => {
    const query = { ...DEFAULT_LIST_QUERY, excludeStatus: 'cancelled,archived' };
    expect(activeFilterChips(query, false)).toEqual([]);
    expect(activeFilterChips(query, true)[0].label).toBe('Statuts exclus : Annulé, Clôturé');
  });

  it('retirer une pastille vide les champs de sa période', () => {
    const onClear = vi.fn();
    const chips = activeFilterChips({ ...DEFAULT_LIST_QUERY, closedFrom: '2026-09-01', closedTo: '2026-09-30' }, false);
    render(<ActiveFilterChips chips={chips} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre « Clôturés du 01/09/2026 au 30/09/2026 »' }));
    expect(onClear).toHaveBeenCalledWith({ closedFrom: '', closedTo: '' });
  });
});
