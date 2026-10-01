import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Package } from 'lucide-react';
import { renderWithProviders } from '@/test/render';
import { KpiCard } from '../KpiCard';
import { UNITS } from '../../lib/kpi-scope';

describe('KpiCard', () => {
  it('comparaison toujours sous la forme « contre N sur la période précédente », avec l’écart quand il se calcule', () => {
    renderWithProviders(
      <>
        <KpiCard label="Bons annulés" value={3} unit={UNITS.bons} icon={Package} delta={{ current: 3, previous: 1 }} />
        <KpiCard label="Bons clôturés" value={4} unit={UNITS.bons} icon={Package} delta={{ current: 4, previous: 0 }} />
        <KpiCard label="Délai" value={2} format="days" icon={Package} delta={{ current: 2, previous: 4, invert: true }} />
      </>,
    );
    expect(screen.getByText('+200 % (contre 1 sur la période précédente)')).toBeInTheDocument();
    expect(screen.getByText('contre 0 sur la période précédente')).toBeInTheDocument();
    expect(screen.getByText(/^-50 % \(contre 4(,0)?\s?j sur la période précédente\)$/)).toBeInTheDocument();
    expect(screen.queryByText(/vs période précédente/)).not.toBeInTheDocument();
  });

  it('sans liste : le « ? » dit pourquoi, même sans définition', async () => {
    const { user } = renderWithProviders(
      <KpiCard label="Délai de décision" value={2} format="days" icon={Package} noList="Une médiane : pas de liste." />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pourquoi pas de liste : Délai de décision' }));
    expect(screen.getByText('Une médiane : pas de liste.')).toBeInTheDocument();
  });
});
