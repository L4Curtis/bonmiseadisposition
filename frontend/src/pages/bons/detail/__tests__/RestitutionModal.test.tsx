import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestitutionModal } from '../RestitutionModal';
import type { EquipmentItem } from '../types';

const equipments: EquipmentItem[] = [
  { id: 'e1', catalogItem: { id: 'c1', brand: 'Dell', model: 'Latitude 5420', category: 'laptop' }, serialNumber: 'SN-1', order: 0 },
  { id: 'e2', catalogItem: { id: 'c2', brand: 'HP', model: 'EliteBook 840', category: 'laptop' }, serialNumber: 'SN-2', order: 1 },
  {
    id: 'e3',
    catalogItem: { id: 'c3', brand: 'Lenovo', model: 'ThinkPad', category: 'laptop' },
    serialNumber: 'SN-3',
    order: 2,
    returnedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('RestitutionModal — sélection multiple', () => {
  it('sélectionne plusieurs équipements et confirme en un seul appel avec tous leurs ids', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RestitutionModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    await user.click(screen.getByRole('button', { name: /Lancer la restitution \(2\)/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(['e1', 'e2']);
  });

  it('un équipement déjà rendu est coché, désactivé, et non compté dans la sélection', () => {
    render(<RestitutionModal equipments={equipments} onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[2]).toBeChecked();
    expect(checkboxes[2]).toBeDisabled();
    expect(screen.getByRole('button', { name: /Lancer la restitution \(0\)/ })).toBeInTheDocument();
  });

  it('le bouton de confirmation reste désactivé tant qu\'aucun équipement n\'est sélectionné', () => {
    render(<RestitutionModal equipments={equipments} onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    expect(screen.getByRole('button', { name: /Lancer la restitution \(0\)/ })).toBeDisabled();
  });

  it('désactive la confirmation pendant le chargement, empêchant un second appel réseau', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RestitutionModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading />);

    const confirmBtn = screen.getByRole('button', { name: /En cours/i });
    expect(confirmBtn).toBeDisabled();
    await user.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
