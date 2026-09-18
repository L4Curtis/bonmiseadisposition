import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { InventoryTable } from '../InventoryTable';
import type { InventoryItem } from '../types';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    equipmentId: 'e1',
    label: 'Latitude 5540',
    category: 'pc_portable',
    categoryLabel: 'PC portable',
    serialNumber: 'SN1',
    inventoryNumber: null,
    bonId: 'b1',
    bonReference: 'BMD-2026-0001',
    bonStatus: 'active',
    situation: 'en_circulation',
    situationLabel: 'En circulation',
    dateMiseDisposition: '2026-09-01T00:00:00.000Z',
    dateRestitution: null,
    collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com', department: null },
    filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' },
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
  sortDirection: '' as const,
  onToggleDateSort: vi.fn(),
};

describe('InventoryTable', () => {
  it('affiche l’ancienneté du prêt sous la date de mise à disposition', () => {
    renderWithProviders(<InventoryTable {...baseProps} items={[makeItem()]} />);
    expect(screen.getByText(/il y a \d+([,.]\d+)? j/)).toBeInTheDocument();
  });

  it('déclenche onToggleDateSort au clic sur l’en-tête « Mise à disposition »', async () => {
    const onToggleDateSort = vi.fn();
    const { user } = renderWithProviders(
      <InventoryTable {...baseProps} items={[makeItem()]} onToggleDateSort={onToggleDateSort} />,
    );

    await user.click(screen.getByRole('button', { name: /Mise à disposition/ }));
    expect(onToggleDateSort).toHaveBeenCalledTimes(1);
  });

  it('marque l’en-tête ascending/descending selon sortDirection', () => {
    const { rerender } = renderWithProviders(
      <InventoryTable {...baseProps} items={[makeItem()]} sortDirection="asc" />,
    );
    expect(screen.getByRole('columnheader', { name: /Mise à disposition/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    rerender(<InventoryTable {...baseProps} items={[makeItem()]} sortDirection="desc" />);
    expect(screen.getByRole('columnheader', { name: /Mise à disposition/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('met en évidence une ligne en retard avec le nombre de jours de retard, pas une ligne à jour', () => {
    const overdueItem = makeItem({ equipmentId: 'e-late', dateRestitution: '2020-01-01T00:00:00.000Z' });
    const onTimeItem = makeItem({ equipmentId: 'e-ontime', dateRestitution: '2999-01-01T00:00:00.000Z' });
    renderWithProviders(<InventoryTable {...baseProps} items={[overdueItem, onTimeItem]} />);

    expect(screen.getByText(/Retard \d+ j/)).toBeInTheDocument();
    // Une seule ligne en retard : un seul badge affiché.
    expect(screen.getAllByText(/Retard \d+ j/)).toHaveLength(1);
  });
});
