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
    collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com', department: null, active: true },
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
  sort: null,
};

describe('InventoryTable', () => {
  it('affiche l’ancienneté du prêt sous la date de mise à disposition', () => {
    renderWithProviders(<InventoryTable {...baseProps} items={[makeItem()]} />);
    expect(screen.getByText(/il y a \d+([,.]\d+)? j/)).toBeInTheDocument();
  });

  it.each([
    ['Équipement', 'label'],
    ['N° série', 'serialNumber'],
    ['Collaborateur', 'collaborateur'],
    ['Filiale', 'filiale'],
    ['Situation', 'situation'],
    ['Mise à disposition', 'dateMiseDisposition'],
    ['Restitution prévue', 'dateRestitution'],
  ])('rend la colonne « %s » triable (onSortChange("%s"))', async (label, field) => {
    const onSortChange = vi.fn();
    const { user } = renderWithProviders(
      <InventoryTable {...baseProps} items={[makeItem()]} onSortChange={onSortChange} />,
    );

    await user.click(screen.getByRole('button', { name: new RegExp(`^${label}$`) }));
    expect(onSortChange).toHaveBeenCalledWith(field);
  });

  it('annonce le tri par aria-sort : ordre par défaut de l’API, puis colonne choisie', () => {
    const { rerender } = renderWithProviders(
      <InventoryTable {...baseProps} items={[makeItem()]} onSortChange={vi.fn()} />,
    );
    // Sans tri choisi : mise à disposition, la plus récente d'abord.
    expect(screen.getByRole('columnheader', { name: /Mise à disposition/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /Filiale/ })).toHaveAttribute('aria-sort', 'none');

    rerender(
      <InventoryTable
        {...baseProps}
        items={[makeItem()]}
        onSortChange={vi.fn()}
        sort={{ field: 'filiale', direction: 'asc' }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Filiale/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Mise à disposition/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('sans onSortChange (détail d’un collaborateur), aucun en-tête n’est un bouton de tri', () => {
    renderWithProviders(<InventoryTable {...baseProps} items={[makeItem()]} />);
    expect(screen.queryByRole('button', { name: /^Filiale$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Filiale/ })).not.toHaveAttribute('aria-sort');
  });

  it('propose d’ouvrir le bon, l’historique du matériel et la restitution (lien profond)', () => {
    renderWithProviders(<InventoryTable {...baseProps} items={[makeItem()]} />);

    expect(screen.getByRole('link', { name: 'Ouvrir le bon BMD-2026-0001' })).toHaveAttribute('href', '/bons/b1');
    expect(screen.getByRole('link', { name: /Voir l’historique de ce matériel/ })).toHaveAttribute('href', '/materiel/SN1');
    expect(screen.getByRole('link', { name: 'Initier la restitution du bon BMD-2026-0001' })).toHaveAttribute(
      'href',
      '/bons/b1?action=restitution',
    );
  });

  it('ne propose la restitution que pour un bon actif ou partiellement restitué', () => {
    renderWithProviders(
      <InventoryTable
        {...baseProps}
        items={[makeItem({ bonStatus: 'sent_mise_dispo', situation: 'en_attente_signature' })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /Initier la restitution/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir le bon/ })).toBeInTheDocument();
  });

  it('direction : ni lien vers le bon ni restitution, mais l’historique du matériel reste accessible', () => {
    renderWithProviders(<InventoryTable {...baseProps} items={[makeItem()]} canLinkToBon={false} />);

    expect(screen.queryByRole('link', { name: /Ouvrir le bon/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Initier la restitution/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'BMD-2026-0001' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir l’historique de ce matériel/ })).toBeInTheDocument();
  });

  it('historique via le n° d’inventaire à défaut de n° de série, aucun lien sans l’un ni l’autre', () => {
    const { rerender } = renderWithProviders(
      <InventoryTable {...baseProps} items={[makeItem({ serialNumber: null, inventoryNumber: 'INV-9' })]} />,
    );
    expect(screen.getByRole('link', { name: /Voir l’historique de ce matériel/ })).toHaveAttribute('href', '/materiel/INV-9');

    rerender(<InventoryTable {...baseProps} items={[makeItem({ serialNumber: null, inventoryNumber: null })]} />);
    expect(screen.queryByRole('link', { name: /Voir l’historique de ce matériel/ })).not.toBeInTheDocument();
  });

  it('signale un compte désactivé sur la colonne collaborateur (information serveur)', () => {
    renderWithProviders(
      <InventoryTable
        {...baseProps}
        items={[
          makeItem(),
          makeItem({
            equipmentId: 'e2',
            collaborateur: { id: 'u2', displayName: 'Paul Parti', email: 'p@example.com', department: null, active: false },
          }),
        ]}
      />,
    );
    expect(screen.getAllByText('Compte désactivé')).toHaveLength(1);
  });

  it('rend le n° de série et le n° d’inventaire cliquables vers la page /materiel/:reference', () => {
    renderWithProviders(
      <InventoryTable {...baseProps} items={[makeItem({ serialNumber: 'SN-777', inventoryNumber: 'INV-888' })]} />,
    );

    const serialLink = screen.getByRole('link', { name: /Historique du matériel SN-777/i });
    expect(serialLink).toHaveAttribute('href', '/materiel/SN-777');

    const inventoryLink = screen.getByRole('link', { name: /Historique du matériel INV-888/i });
    expect(inventoryLink).toHaveAttribute('href', '/materiel/INV-888');
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
