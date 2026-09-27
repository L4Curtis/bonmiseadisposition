import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestitutionModal } from '../RestitutionModal';
import { equipment } from './fixtures';

const laptop = (id: string, serialNumber: string, overrides = {}) =>
  equipment({ id, serialNumber, catalogItem: { id: `c-${id}`, brand: 'Dell', model: 'Latitude', category: 'pc_portable' }, ...overrides });

const equipments = [
  laptop('e1', 'SN-1'),
  laptop('e2', 'SN-2'),
  laptop('e3', 'SN-3', { returnedAt: '2026-01-01T00:00:00.000Z', returnState: 'returned' }),
];

describe('RestitutionModal — même sélection par email et au guichet (R-001)', () => {
  it('au guichet : seuls les équipements cochés sont transmis', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RestitutionModal equipments={equipments} channel="in_person" onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    expect(screen.getByRole('dialog', { name: /Restitution au guichet/ })).toBeInTheDocument();
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Continuer : signature IT \(1\)/ }));

    expect(onConfirm).toHaveBeenCalledWith(['e1'], []);
  });

  it('un équipement déjà rendu et signé est coché, désactivé, et ne compte pas', () => {
    render(<RestitutionModal equipments={equipments} channel="email" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[2]).toBeChecked();
    expect(checkboxes[2]).toBeDisabled();
    expect(screen.getByRole('button', { name: /Continuer : signature IT \(0\)/ })).toBeDisabled();
  });

  it('une restitution déjà marquée et pas encore signée se poursuit sans nouvelle sélection', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const marked = [laptop('e1', 'SN-1', { returnedAt: '2026-01-02T00:00:00.000Z', returnState: 'returned_to_sign' }), laptop('e2', 'SN-2')];
    render(<RestitutionModal equipments={marked} channel="in_person" onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    expect(screen.getByText('Rendu — restitution à signer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continuer : signature IT \(1\)/ }));
    expect(onConfirm).toHaveBeenCalledWith([], []);
  });

  it('au guichet, un équipement marqué par l’email mais pas rapporté se décoche (IMD n° 9)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const marked = [laptop('e1', 'SN-1', { returnedAt: '2026-01-02T00:00:00.000Z', returnState: 'returned_to_sign' }), laptop('e2', 'SN-2')];
    render(<RestitutionModal equipments={marked} channel="in_person" onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    const [first, second] = screen.getAllByRole('checkbox');
    expect(first).toBeEnabled();
    await user.click(first);
    expect(screen.getByText('Restera chez le collaborateur')).toBeInTheDocument();
    await user.click(second);
    await user.click(screen.getByRole('button', { name: /Continuer : signature IT \(1\)/ }));
    expect(onConfirm).toHaveBeenCalledWith(['e2'], ['e1']);
  });
});
