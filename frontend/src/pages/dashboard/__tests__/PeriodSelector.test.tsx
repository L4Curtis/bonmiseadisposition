import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { usePeriodParams } from '../use-period-params';
import { PeriodSelector } from '../PeriodSelector';

/** Petit harnais qui relie PeriodSelector à l'état d'URL réel (usePeriodParams),
 *  comme le fait DashboardPage — pour vérifier l'écriture dans l'URL. */
function Harness() {
  const { preset, from, to, setPreset, setRange } = usePeriodParams();
  return (
    <>
      <PeriodSelector preset={preset} from={from} to={to} onPresetChange={setPreset} onRangeChange={setRange} />
      <div data-testid="range">{from} → {to}</div>
    </>
  );
}

describe('PeriodSelector', () => {
  it('writes a 7-day range to the URL when "7 j" is clicked, and marks it active', async () => {
    const { user } = renderWithProviders(<Harness />);

    const button = screen.getByRole('button', { name: '7 j' });
    await user.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');

    const rangeText = screen.getByTestId('range').textContent ?? '';
    const [from, to] = rangeText.split(' → ');
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    expect(days).toBe(7);
  });

  it('shows the custom date inputs and marks "Personnalisé" active for a range matching no preset', () => {
    renderWithProviders(<Harness />, { route: '/?from=2000-01-01&to=2000-01-05' });

    expect(screen.getByLabelText('Date de début')).toBeInTheDocument();
    expect(screen.getByLabelText('Date de fin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Personnalisé' })).toHaveAttribute('aria-pressed', 'true');
  });
});
