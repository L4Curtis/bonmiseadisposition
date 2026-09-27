import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BonsAdvancedFilters } from '../BonsAdvancedFilters';
import { DEFAULT_LIST_QUERY } from '../bonsListQuery';

describe('BonsAdvancedFilters — étape de la restitution en cours', () => {
  it('le sous-état venu de l’accueil est visible et se retire', () => {
    const onChange = vi.fn();
    render(
      <BonsAdvancedFilters
        query={{ ...DEFAULT_LIST_QUERY, subStatus: 'partial_restitution_to_sign' }}
        onChange={onChange}
        currentUserId="u1"
        creators={[]}
      />,
    );
    const select = screen.getByLabelText('Filtrer par étape de la restitution en cours') as HTMLSelectElement;
    expect(select.value).toBe('partial_restitution_to_sign');
    expect(select.selectedOptions[0].textContent).toBe('Restitution partielle à signer');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ subStatus: '' });
  });
});
