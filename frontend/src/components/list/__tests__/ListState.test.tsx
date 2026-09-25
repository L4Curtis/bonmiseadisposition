import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListState } from '../ListState';

const BASE = {
  loading: false,
  error: null,
  isEmpty: false,
  emptyMessage: 'Aucun bon',
};

describe('ListState', () => {
  it('affiche la liste quand il y a des données', () => {
    render(<ListState {...BASE}><p>la liste</p></ListState>);
    expect(screen.getByText('la liste')).toBeInTheDocument();
  });

  it('chargement initial : un indicateur annoncé, pas la liste', () => {
    render(<ListState {...BASE} loading isEmpty><p>la liste</p></ListState>);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    expect(screen.queryByText('la liste')).not.toBeInTheDocument();
  });

  it('rechargement avec des données déjà là : la liste reste, marquée occupée', () => {
    render(<ListState {...BASE} loading><p>la liste</p></ListState>);
    expect(screen.getByText('la liste').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  it('erreur : le message et « Réessayer », jamais une fausse liste vide', async () => {
    const onRetry = vi.fn();
    render(
      <ListState {...BASE} isEmpty error="Le serveur ne répond pas" onRetry={onRetry}>
        <p>la liste</p>
      </ListState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Le serveur ne répond pas');
    expect(screen.queryByText('Aucun bon')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('vide sans filtre : le message et l’action proposée', () => {
    render(
      <ListState {...BASE} isEmpty emptyAction={<button type="button">Ajouter un article</button>}>
        <p>la liste</p>
      </ListState>,
    );
    expect(screen.getByText('Aucun bon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un article' })).toBeInTheDocument();
  });

  it('vide à cause des filtres : le dit, et propose de les effacer', async () => {
    const onClearFilters = vi.fn();
    render(
      <ListState {...BASE} isEmpty hasActiveFilters onClearFilters={onClearFilters}>
        <p>la liste</p>
      </ListState>,
    );
    expect(screen.getByText('Aucun résultat pour ces filtres')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
