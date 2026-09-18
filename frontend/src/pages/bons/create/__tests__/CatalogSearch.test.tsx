import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogSearch } from '../CatalogSearch';
import type { CatalogItem } from '../types';

const items: CatalogItem[] = [
  { id: '1', brand: 'Dell', model: 'Latitude 5420', category: 'laptop', active: true },
  { id: '2', brand: 'HP', model: 'EliteBook 840', category: 'laptop', active: true },
];

describe('CatalogSearch — quantité', () => {
  it('quantité par défaut (1) : un seul appel à onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<CatalogSearch allItems={items} onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText('Ajouter depuis le catalogue...'), 'Dell');
    await user.click(await screen.findByText('Dell Latitude 5420'));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(items[0]);
  });

  it('quantité N : appelle onAdd N fois pour créer N lignes prêtes à recevoir leur numéro de série', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<CatalogSearch allItems={items} onAdd={onAdd} />);

    const qtyInput = screen.getByLabelText('Quantité à ajouter');
    await user.clear(qtyInput);
    await user.type(qtyInput, '5');

    await user.type(screen.getByPlaceholderText('Ajouter depuis le catalogue...'), 'Dell');
    await user.click(await screen.findByText('Dell Latitude 5420'));

    expect(onAdd).toHaveBeenCalledTimes(5);
    expect(onAdd).toHaveBeenNthCalledWith(1, items[0]);
    expect(onAdd).toHaveBeenNthCalledWith(5, items[0]);
  });

  it('remet la quantité à 1 après un ajout', async () => {
    const user = userEvent.setup();
    render(<CatalogSearch allItems={items} onAdd={vi.fn()} />);

    const qtyInput = screen.getByLabelText('Quantité à ajouter') as HTMLInputElement;
    await user.clear(qtyInput);
    await user.type(qtyInput, '3');
    await user.type(screen.getByPlaceholderText('Ajouter depuis le catalogue...'), 'Dell');
    await user.click(await screen.findByText('Dell Latitude 5420'));

    expect(qtyInput.value).toBe('1');
  });

  it('plafonne une quantité excessive', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<CatalogSearch allItems={items} onAdd={onAdd} />);

    const qtyInput = screen.getByLabelText('Quantité à ajouter');
    await user.clear(qtyInput);
    await user.type(qtyInput, '9999');
    await user.type(screen.getByPlaceholderText('Ajouter depuis le catalogue...'), 'Dell');
    await user.click(await screen.findByText('Dell Latitude 5420'));

    expect(onAdd).toHaveBeenCalledTimes(50);
  });
});

describe('CatalogSearch — navigation clavier', () => {
  it('a les rôles ARIA combobox/listbox/option et aria-expanded reflète l\'ouverture', async () => {
    const user = userEvent.setup();
    render(<CatalogSearch allItems={items} onAdd={vi.fn()} />);

    const input = screen.getByPlaceholderText('Ajouter depuis le catalogue...');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.type(input, 'e');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('ArrowDown/ArrowUp déplacent la sélection active (aria-selected)', async () => {
    const user = userEvent.setup();
    render(<CatalogSearch allItems={items} onAdd={vi.fn()} />);

    const input = screen.getByPlaceholderText('Ajouter depuis le catalogue...');
    await user.type(input, 'e');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Entrée ajoute le résultat actif', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<CatalogSearch allItems={items} onAdd={onAdd} />);

    const input = screen.getByPlaceholderText('Ajouter depuis le catalogue...');
    await user.type(input, 'e');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onAdd).toHaveBeenCalledWith(items[1]);
  });

  it('Échap referme la liste sans ajouter', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<CatalogSearch allItems={items} onAdd={onAdd} />);

    const input = screen.getByPlaceholderText('Ajouter depuis le catalogue...');
    await user.type(input, 'e');
    await user.keyboard('{Escape}');

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
