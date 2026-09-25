import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '../Pagination';

const ITEMS = { singular: 'bon', plural: 'bons' };

function setup(overrides: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  const props = {
    page: 2,
    pageSize: 25 as const,
    total: 132,
    onPageChange,
    onPageSizeChange,
    itemLabel: ITEMS,
    ...overrides,
  };
  render(<Pagination {...props} />);
  return { props: { onPageChange, onPageSizeChange }, user: userEvent.setup() };
}

describe('Pagination', () => {
  it('annonce la plage affichée et le total', () => {
    setup();
    expect(screen.getByText('26–50 sur 132 bons')).toBeInTheDocument();
    expect(screen.getByText('Page 2 sur 6')).toBeInTheDocument();
  });

  it('écrit les grands nombres à la française', () => {
    setup({ page: 1, total: 1234 });
    expect(screen.getByText('1–25 sur 1 234 bons')).toBeInTheDocument();
  });

  it('accorde le nom au singulier', () => {
    setup({ page: 1, total: 1 });
    expect(screen.getByText('1–1 sur 1 bon')).toBeInTheDocument();
  });

  it('Précédent et Suivant changent de page', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Page précédente' }));
    await user.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(props.onPageChange.mock.calls).toEqual([[1], [3]]);
  });

  it('désactive Précédent en page 1 et Suivant en dernière page', () => {
    setup({ page: 1, total: 20 });
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
  });

  it('propose 25, 50 ou 100 lignes par page', async () => {
    const { props, user } = setup();
    const select = screen.getByLabelText('Lignes par page');
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(['25', '50', '100']);
    await user.selectOptions(select, '100');
    expect(props.onPageSizeChange).toHaveBeenCalledWith(100);
  });

  it('sans gestionnaire de taille, pas de sélecteur', () => {
    setup({ onPageSizeChange: undefined });
    expect(screen.queryByLabelText('Lignes par page')).not.toBeInTheDocument();
  });

  it('rien à paginer pour une liste vide (l’état vide s’en charge)', () => {
    const { container } = render(
      <Pagination page={1} pageSize={25} total={0} onPageChange={vi.fn()} itemLabel={ITEMS} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('est une zone de navigation nommée', () => {
    setup();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });
});
