import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { SCREEN_LABELS } from '@/domain/labels';
import { UnauthorizedPage } from '../Unauthorized';

beforeEach(() => {
  document.title = '';
});

describe('Page de refus (accès interdit)', () => {
  it('explique le refus en français, sans code d’erreur brut', () => {
    renderWithProviders(<UnauthorizedPage />);

    expect(screen.getByRole('heading', { level: 1, name: SCREEN_LABELS.accesRefuse })).toBeInTheDocument();
    expect(screen.getByText(/réservé à d’autres profils/)).toBeInTheDocument();
    expect(screen.queryByText('403')).not.toBeInTheDocument();
  });

  it('propose un retour à l’accueil, assez grand pour le doigt', () => {
    renderWithProviders(<UnauthorizedPage />);

    const retour = screen.getByRole('link', { name: "Retour à l'accueil" });
    expect(retour).toHaveAttribute('href', '/');
    expect(retour.className).toMatch(/\bh-11\b/);
  });

  it('donne un titre d’onglet propre', async () => {
    renderWithProviders(<UnauthorizedPage />);

    await waitFor(() => expect(document.title).toBe(`${SCREEN_LABELS.accesRefuse} · Bons IT`));
  });
});
