import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

export interface ChartTheme {
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  /** [chart1..chart5] — pratique pour indexer une palette par série. */
  series: string[];
  primary: string;
  mutedForeground: string;
  border: string;
  /** Fond neutre (survol des barres, curseur). */
  muted: string;
}

/** Lit une variable CSS HSL (« H S% L% ») du thème actif et la met en forme
 *  utilisable comme couleur SVG (`hsl(...)`). Ne jamais écrire `hsl(var(--x))`
 *  dans un attribut SVG : certains moteurs de rendu (dont jsdom en test) ne
 *  résolvent pas les variables CSS dans ce contexte. */
function readColorVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `hsl(${value})` : '';
}

/** Couleurs de graphiques recalculées à chaque changement de thème (clair/sombre). */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();

  return useMemo(() => {
    const chart1 = readColorVar('--chart-1');
    const chart2 = readColorVar('--chart-2');
    const chart3 = readColorVar('--chart-3');
    const chart4 = readColorVar('--chart-4');
    const chart5 = readColorVar('--chart-5');

    return {
      chart1,
      chart2,
      chart3,
      chart4,
      chart5,
      series: [chart1, chart2, chart3, chart4, chart5],
      primary: readColorVar('--primary'),
      mutedForeground: readColorVar('--muted-foreground'),
      border: readColorVar('--border'),
      muted: readColorVar('--muted'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- les variables CSS lues ne sont pas des dépendances React : c'est le thème qui les change.
  }, [theme]);
}
