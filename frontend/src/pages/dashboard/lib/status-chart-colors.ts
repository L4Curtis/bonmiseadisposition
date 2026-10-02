/**
 * Couleurs du donut « Bons par statut » : une couleur par statut, la même
 * dans la part et dans la pastille de la légende, en thème clair comme en
 * sombre. Les teintes viennent de la palette des graphiques (`--chart-1` à
 * `--chart-7`, `index.css`), en suivant le sens des badges de statut (attente
 * en ambre, bon vivant en vert, litige en rouge). L'écart entre deux couleurs est vérifié par un test
 * (`__tests__/status-chart-colors.test.ts`).
 */
import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import type { BonStatus } from '@/contracts/common';

type Theme = 'light' | 'dark';

/** Variable CSS du thème, ou valeur « H S% L% » propre à chaque thème. */
export type StatusColorSource =
  | { readonly token: string }
  | { readonly light: string; readonly dark: string };

export const STATUS_CHART_COLORS: Readonly<Record<BonStatus, StatusColorSource>> = {
  draft: { token: '--muted-foreground' },
  sent_mise_dispo: { token: '--chart-3' },
  active: { token: '--chart-4' },
  sent_restitution: { token: '--chart-6' },
  partially_returned: { token: '--chart-5' },
  contested: { token: '--chart-1' },
  archived: { token: '--chart-2' },
  cancelled: { token: '--chart-7' },
};

/** Couleur SVG (`hsl(…)`) d'un statut dans un thème ; `readToken` lit la
 *  valeur « H S% L% » d'une variable CSS du thème actif. */
export function statusChartColor(status: BonStatus, theme: Theme, readToken: (name: string) => string): string {
  const source = STATUS_CHART_COLORS[status];
  const value = 'token' in source ? readToken(source.token) : source[theme];
  return value ? `hsl(${value})` : '';
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isBonStatus(value: string): value is BonStatus {
  return Object.prototype.hasOwnProperty.call(STATUS_CHART_COLORS, value);
}

/** Couleur d'un statut dans le thème actif, recalculée quand il change ;
 *  `undefined` pour un statut inconnu ou une couleur illisible (le graphique
 *  reprend alors sa palette). */
export function useStatusChartColors(): (status: string) => string | undefined {
  const { theme } = useTheme();
  return useMemo(() => {
    const statuses = Object.keys(STATUS_CHART_COLORS) as BonStatus[];
    const colors: Readonly<Record<BonStatus, string>> = Object.fromEntries(
      statuses.map((status) => [status, statusChartColor(status, theme, readCssVar)]),
    ) as Record<BonStatus, string>;
    return (status: string) => (isBonStatus(status) && colors[status]) || undefined;
  }, [theme]);
}
