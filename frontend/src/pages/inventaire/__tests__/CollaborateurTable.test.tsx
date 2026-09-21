import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CollaborateurTable } from '../CollaborateurTable';
import type { CollaborateurInventoryItem } from '../types';
import type { InventoryBaseFilters } from '../inventoryFilterParams';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from '@/lib/api';

const EMPTY_FILTERS: InventoryBaseFilters = {
  filialeFilter: '', categoryFilter: '', situationFilter: '', search: '', overdueFilter: false,
};

function makeCollaborateur(overrides: Partial<CollaborateurInventoryItem> = {}): CollaborateurInventoryItem {
  return {
    collaborateurId: 'u1',
    displayName: 'Jean Dupont',
    email: 'jean@x.fr',
    department: 'IT',
    filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' },
    active: true,
    count: 5,
    overdueCount: 0,
    oldestDateMiseDisposition: '2026-01-05T00:00:00.000Z',
    oldestAgeDays: 256,
    ...overrides,
  };
}

const baseProps = {
  loading: false,
  loadError: null,
  onRetry: vi.fn(),
  hasActiveFilters: false,
  onResetFilters: vi.fn(),
  canLinkToBon: true,
  sort: 'count' as const,
  onSortChange: vi.fn(),
  filters: EMPTY_FILTERS,
  truncated: false,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CollaborateurTable', () => {
  it('affiche une ligne par collaborateur avec service, filiale et ancienneté du prêt le plus ancien', () => {
    renderWithProviders(<CollaborateurTable {...baseProps} items={[makeCollaborateur()]} />);

    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText('IT')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/il y a \d+([,.]\d+)? j/)).toBeInTheDocument();
  });

  it('met en évidence le nombre de retards uniquement quand il y en a', () => {
    const { rerender } = renderWithProviders(
      <CollaborateurTable {...baseProps} items={[makeCollaborateur({ overdueCount: 3 })]} />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();

    rerender(<CollaborateurTable {...baseProps} items={[makeCollaborateur({ overdueCount: 0 })]} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('affiche la pastille "Compte désactivé" pour un collaborateur inactif, absente sinon', () => {
    const { rerender } = renderWithProviders(
      <CollaborateurTable {...baseProps} items={[makeCollaborateur({ active: false })]} />,
    );
    expect(screen.getByText('Compte désactivé')).toBeInTheDocument();

    rerender(<CollaborateurTable {...baseProps} items={[makeCollaborateur({ active: true })]} />);
    expect(screen.queryByText('Compte désactivé')).not.toBeInTheDocument();
  });

  it('affiche l\'état vide explicite quand aucun collaborateur ne correspond', () => {
    renderWithProviders(<CollaborateurTable {...baseProps} items={[]} />);
    expect(screen.getByText('Aucun collaborateur ne correspond aux filtres')).toBeInTheDocument();
  });

  it('affiche l\'erreur avec un bouton Réessayer', async () => {
    const onRetry = vi.fn();
    const { user } = renderWithProviders(
      <CollaborateurTable {...baseProps} items={[]} loadError="Erreur réseau" onRetry={onRetry} />,
    );
    expect(screen.getByText('Erreur réseau')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('déplie une ligne au clic, charge le détail filtré par collaborateur, et un second clic replie', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [
        {
          equipmentId: 'e1', label: 'Latitude 5540', category: 'pc_portable', categoryLabel: 'PC portable',
          serialNumber: 'SN1', inventoryNumber: null, bonId: 'b1', bonReference: 'BMD-2026-0001', bonStatus: 'active',
          situation: 'en_circulation', situationLabel: 'En circulation', dateMiseDisposition: '2026-01-01T00:00:00.000Z',
          dateRestitution: null, collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@x.fr', department: 'IT' },
          filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' },
        },
      ],
      total: 1, page: 1, limit: 200,
    });

    const { user } = renderWithProviders(<CollaborateurTable {...baseProps} items={[makeCollaborateur()]} />);

    const toggleButton = screen.getByRole('button', { name: /Jean Dupont/ });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    await waitFor(() => expect(screen.getByText('BMD-2026-0001')).toBeInTheDocument());
    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string];
    expect(calledUrl).toContain('collaborateurId=u1');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('BMD-2026-0001')).not.toBeInTheDocument();
  });

  it('ne rend pas la référence de bon cliquable dans le détail déplié pour la Direction (canLinkToBon=false)', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [
        {
          equipmentId: 'e1', label: 'Latitude 5540', category: 'pc_portable', categoryLabel: 'PC portable',
          serialNumber: 'SN1', inventoryNumber: null, bonId: 'b1', bonReference: 'BMD-2026-0001', bonStatus: 'active',
          situation: 'en_circulation', situationLabel: 'En circulation', dateMiseDisposition: '2026-01-01T00:00:00.000Z',
          dateRestitution: null, collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@x.fr', department: 'IT' },
          filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' },
        },
      ],
      total: 1, page: 1, limit: 200,
    });

    const { user } = renderWithProviders(
      <CollaborateurTable {...baseProps} items={[makeCollaborateur()]} canLinkToBon={false} />,
    );

    await user.click(screen.getByRole('button', { name: /Jean Dupont/ }));
    const ref = await screen.findByText('BMD-2026-0001');
    expect(ref.closest('a')).toBeNull();
  });
});

describe('CollaborateurTable — regroupement tronqué', () => {
  // Un classement incomplet affiché comme complet induit en erreur : on vérifie
  // que l'avertissement apparaît, et seulement quand il doit apparaître.
  it('avertit quand le serveur a plafonné le regroupement', () => {
    renderWithProviders(
      <CollaborateurTable {...baseProps} truncated items={[makeCollaborateur()]} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/ne porte que sur une partie des équipements/i);
  });

  it("n'affiche aucun avertissement sur un regroupement complet", () => {
    renderWithProviders(<CollaborateurTable {...baseProps} items={[makeCollaborateur()]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it("n'affiche pas l'avertissement pendant le chargement", () => {
    renderWithProviders(<CollaborateurTable {...baseProps} truncated loading items={[]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
