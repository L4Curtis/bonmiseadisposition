import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BonsTable, type BonsTableProps } from '../BonsTable';
import type { Bon } from '../types';
import type { BonsSelection } from '../useBonsSelection';

function bon(overrides: Partial<Bon> = {}): Bon {
  return {
    id: 'bon-1',
    reference: 'BMD-2026-0001',
    status: 'sent_mise_dispo',
    collaborateurEmail: 'jean@exemple.fr',
    dateMiseDisposition: '2026-09-01',
    dateRestitution: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
    collaborateur: { id: 'c1', displayName: 'Jean Martin', email: 'jean@exemple.fr' },
    filiale: { id: 'f1', displayName: 'PEDUZZI' },
    createdBy: { id: 'u1', displayName: 'Tech' },
    equipments: [{ id: 'e1' }, { id: 'e2' }],
    signatures: [{ type: 'mise_disposition', signed: false, createdAt: '2026-09-01T09:00:00.000Z' }],
    ...overrides,
  };
}

function selection(overrides: Partial<BonsSelection> = {}): BonsSelection {
  return {
    selectedIds: new Set(),
    selectedBons: [],
    allSelected: false,
    someSelected: false,
    toggle: vi.fn(),
    toggleAll: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

function renderTable(props: Partial<BonsTableProps> = {}) {
  const all: BonsTableProps = {
    loading: false,
    loadError: null,
    bons: [bon(), bon({ id: 'bon-2', reference: 'BMD-2026-0002', status: 'active', signatures: [] })],
    hasActiveFilters: false,
    onRetry: vi.fn(),
    onCreateNew: vi.fn(),
    onResetFilters: vi.fn(),
    sort: 'createdAt',
    order: 'desc',
    onSort: vi.fn(),
    selection: selection(),
    onResend: vi.fn(),
    resendLoadingId: null,
    resendBusy: false,
    ...props,
  };
  render(<MemoryRouter><BonsTable {...all} /></MemoryRouter>);
  return all;
}

describe('BonsTable', () => {
  it('ouvre chaque bon par un vrai lien (clic du milieu, Ctrl+clic, clavier)', () => {
    renderTable();
    const link = screen.getByRole('link', { name: /BMD-2026-0001/ });
    expect(link).toHaveAttribute('href', '/bons/bon-1');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('expose le tri courant par aria-sort et trie au clic sur un en-tête', () => {
    const props = renderTable({ sort: 'reference', order: 'asc' });
    const refHeader = screen.getByRole('columnheader', { name: /Référence/ });
    expect(refHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Collaborateur/ })).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(within(screen.getByRole('columnheader', { name: /Dernière activité/ })).getByRole('button'));
    expect(props.onSort).toHaveBeenCalledWith('updatedAt');
  });

  it('affiche la dernière activité en durée relative', () => {
    renderTable();
    expect(screen.getAllByText('il y a 12 j').length).toBeGreaterThan(0);
  });

  it('propose la relance sur un bon en attente de signature seulement', () => {
    const props = renderTable();
    const buttons = screen.getAllByRole('button', { name: /Relancer le lien de signature/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(props.onResend).toHaveBeenCalledWith(expect.objectContaining({ id: 'bon-1' }));
  });

  it('ne propose pas la relance à un collaborateur sans adresse email', () => {
    renderTable({ bons: [bon({ collaborateurEmail: null, collaborateur: { id: 'c', displayName: 'Sans mail', email: null } })] });
    expect(screen.queryByRole('button', { name: /Relancer/ })).not.toBeInTheDocument();
    expect(screen.getByText('Sans adresse email')).toBeInTheDocument();
  });

  it('coche une ligne et toute la page', () => {
    const sel = selection();
    renderTable({ selection: sel });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner le bon BMD-2026-0002' }));
    expect(sel.toggle).toHaveBeenCalledWith('bon-2');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner tous les bons de la page' }));
    expect(sel.toggleAll).toHaveBeenCalled();
  });
});
