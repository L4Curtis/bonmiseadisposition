import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ListNotice } from '../ListNotice';

describe('ListNotice — filtres écartés', () => {
  it('annonce le message et se ferme par un bouton tactile nommé', () => {
    const onDismiss = vi.fn();
    render(<ListNotice message="Un filtre n’était pas valide et a été ignoré : statut." onDismiss={onDismiss} />);

    expect(screen.getByRole('status').textContent).toContain('Un filtre n’était pas valide et a été ignoré : statut.');
    const close = screen.getByRole('button', { name: 'Fermer le message' });
    expect(close.className).toContain('h-11');
    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
