import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileText } from 'lucide-react';
import { StatCard } from '../StatCard';

describe('StatCard', () => {
  it('renders the label and formatted value', () => {
    render(<StatCard label="Total bons" value={42} icon={FileText} />);
    expect(screen.getByText('Total bons')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows a positive delta for an improvement', () => {
    render(<StatCard label="Actifs" value={112} icon={FileText} delta={{ current: 112, previous: 100 }} />);
    expect(screen.getByText(/\+12 % vs période précédente/)).toBeInTheDocument();
  });

  it('shows a negative delta for a regression', () => {
    render(<StatCard label="Actifs" value={90} icon={FileText} delta={{ current: 90, previous: 100 }} />);
    const line = screen.getByText(/-10 % vs période précédente/);
    expect(line).toHaveClass('text-red-600');
  });

  it('invert reverses which direction counts as an improvement', () => {
    // Une baisse du nombre de retards (current < previous) est une amélioration
    // quand `invert` est actif.
    render(<StatCard label="Retards" value={5} icon={FileText} delta={{ current: 5, previous: 10, invert: true }} />);
    const line = screen.getByText(/-50 % vs période précédente/);
    expect(line).toHaveClass('text-emerald-600');
  });

  it('shows "—" when there is no previous value to compare to', () => {
    render(<StatCard label="Actifs" value={10} icon={FileText} delta={{ current: 10, previous: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('formats the value as a percentage when format="percent"', () => {
    render(<StatCard label="Couverture" value={0.93} icon={FileText} format="percent" />);
    expect(screen.getByText('93 %')).toBeInTheDocument();
  });

  it('renders as a button and calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StatCard label="Total bons" value={5} icon={FileText} onClick={onClick} />);
    const button = screen.getByRole('button', { name: /Total bons/ });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a non-interactive element when there is no onClick', () => {
    render(<StatCard label="Total bons" value={5} icon={FileText} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a skeleton instead of the value when loading', () => {
    render(<StatCard label="Total bons" value={null} icon={FileText} loading />);
    expect(screen.queryByText('Total bons')).not.toBeInTheDocument();
  });
});
