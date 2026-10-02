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

describe('BonsAdvancedFilters — période inversée', () => {
  it('annonce l’erreur sous les dates et marque les deux champs', () => {
    render(
      <BonsAdvancedFilters
        query={{ ...DEFAULT_LIST_QUERY, dateFrom: '2026-05-01', dateTo: '2026-04-01' }}
        onChange={vi.fn()}
        currentUserId="u1"
        creators={[]}
        dateRangeError="La date de début doit précéder la date de fin : la période n’est pas appliquée."
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('La date de début doit précéder la date de fin : la période n’est pas appliquée.');
    for (const label of ['Mis à disposition du', 'au']) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    }
  });

  it('sans erreur, aucun message ni champ marqué', () => {
    render(<BonsAdvancedFilters query={DEFAULT_LIST_QUERY} onChange={vi.fn()} currentUserId="u1" creators={[]} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Mis à disposition du').getAttribute('aria-invalid')).toBeNull();
  });
});
