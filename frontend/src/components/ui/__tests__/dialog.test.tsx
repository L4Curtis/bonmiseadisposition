import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog';

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Titre</DialogTitle>
        <DialogDescription>Contenu</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
  return onOpenChange;
}

describe('DialogContent : croix de fermeture', () => {
  it('porte le libellé accessible « Fermer » (en français)', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('offre une cible tactile d’au moins 44 px (h-11 w-11)', () => {
    renderDialog();
    const close = screen.getByRole('button', { name: 'Fermer' });
    expect(close).toHaveClass('h-11', 'w-11');
  });

  it('ferme la fenêtre', async () => {
    const onOpenChange = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
