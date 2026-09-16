import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeSeriesChart, formatBucketLabel } from '../TimeSeriesChart';
import { DonutChart } from '../DonutChart';
import { HorizontalBars } from '../HorizontalBars';

// jsdom ne calcule pas de mise en page réelle : ResponsiveContainer (qui lit
// la taille du conteneur via ResizeObserver) est remplacé par un conteneur de
// taille fixe qui transmet width/height directement à son enfant, comme
// recommandé pour tester des graphiques Recharts en environnement jsdom.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) => (
      <div style={{ width: 800, height: 300 }}>
        {isValidElement(children) ? cloneElement(children, { width: 800, height: 300 } as object) : children}
      </div>
    ),
  };
});

describe('TimeSeriesChart', () => {
  it('renders the legend label for each series', () => {
    const data = [
      { bucket: '2026-09-01', created: 3, sent: 2 },
      { bucket: '2026-09-02', created: 1, sent: 4 },
    ];
    render(
      <TimeSeriesChart
        data={data}
        series={[{ key: 'created', label: 'Créés' }, { key: 'sent', label: 'Envoyés' }]}
        granularity="day"
      />,
    );
    expect(screen.getByText('Créés')).toBeInTheDocument();
    expect(screen.getByText('Envoyés')).toBeInTheDocument();
  });
});

describe('formatBucketLabel', () => {
  it('formats a day bucket in French', () => {
    expect(formatBucketLabel('2026-09-16', 'day')).toMatch(/16 sept\.?/);
  });

  it('formats a month bucket in French', () => {
    expect(formatBucketLabel('2026-09-01', 'month')).toMatch(/sept\.? 2026/);
  });

  it('formats a week bucket as an ISO week number', () => {
    expect(formatBucketLabel('2026-09-14', 'week')).toMatch(/^S\d{1,2}$/);
  });
});

describe('DonutChart', () => {
  it('renders each slice label with its computed share', () => {
    render(
      <DonutChart
        data={[
          { key: 'a', label: 'PC portable', value: 30 },
          { key: 'b', label: 'Écran', value: 10 },
        ]}
      />,
    );
    expect(screen.getByText('PC portable')).toBeInTheDocument();
    expect(screen.getByText(/75 %/)).toBeInTheDocument();
    expect(screen.getByText('Écran')).toBeInTheDocument();
    expect(screen.getByText(/25 %/)).toBeInTheDocument();
  });
});

describe('HorizontalBars', () => {
  it('renders without crashing for a list of labelled values', () => {
    const { container } = render(
      <HorizontalBars data={[{ key: 'a', label: 'Paris', value: 12 }, { key: 'b', label: 'Lyon', value: 8 }]} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
