import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartTooltip } from '../ChartTooltip';

describe('ChartTooltip', () => {
  it('ne rend rien quand inactive ou sans données', () => {
    const { container } = render(<ChartTooltip active={false} payload={[{ name: 'A', value: 1 }]} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<ChartTooltip active payload={[]} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('affiche le titre formaté, les séries et les valeurs en français avec les classes du thème', () => {
    render(
      <ChartTooltip
        active
        label="2026-09-16"
        labelFormatter={(l) => `Semaine du ${l}`}
        payload={[
          { name: 'Créés', value: 1234, color: 'hsl(4 69% 51%)', dataKey: 'created' },
          { name: 'Envoyés', value: '7', color: 'hsl(217 91% 60%)', dataKey: 'sent' },
        ]}
      />,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip.className).toContain('bg-popover');
    expect(tip.className).toContain('text-popover-foreground');
    expect(tip.className).toContain('border-border');
    expect(screen.getByText('Semaine du 2026-09-16')).toBeInTheDocument();
    expect(screen.getByText('Créés')).toBeInTheDocument();
    expect(screen.getByText('Envoyés')).toBeInTheDocument();
    expect(screen.getByText(/1\s?234/)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('masque le nom de série et applique un formateur de valeur', () => {
    render(
      <ChartTooltip active label="Mise à disposition" hideSeriesName payload={[{ name: 'value', value: 36 }]} valueFormatter={(v) => `${v} h`} />,
    );
    expect(screen.queryByText('value')).not.toBeInTheDocument();
    expect(screen.getByText('36 h')).toBeInTheDocument();
  });
});
