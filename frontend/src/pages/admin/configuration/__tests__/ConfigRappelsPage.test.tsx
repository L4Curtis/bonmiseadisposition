import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { ConfigRegistryEntry } from '@/contracts/config-registry';
import { ConfigRappelsPage } from '../ConfigRappelsPage';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), getList: vi.fn(), post: vi.fn(), put: vi.fn() } };
});
vi.mock('@/hooks/use-config-health', () => ({ refreshConfigHealth: vi.fn() }));

import { api } from '@/lib/api';

function entry(name: string, overrides: Partial<ConfigRegistryEntry>): ConfigRegistryEntry {
  return {
    key: `rappels.${name}`, category: 'rappels', name, label: name, type: 'integer', min: 1, max: 90,
    secret: false, adminOnly: true, healthSection: 'rappels', storedValue: null, defaultValue: 7,
    appliedValue: 7, source: 'default', adjusted: false, ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

function renderWith(stored: Record<string, string>, registry: ConfigRegistryEntry[]) {
  vi.mocked(api.get).mockResolvedValue(stored);
  vi.mocked(api.getList).mockResolvedValue({
    items: registry, total: registry.length, page: 1, limit: registry.length, truncated: false,
  } as never);
  return renderWithProviders(<ConfigRappelsPage />);
}

describe('ConfigRappelsPage — bornes des délais', () => {
  it('annonce « Entre 1 et 90 jours » pour le seuil de retard de signature et les rappels', async () => {
    renderWith({}, []);

    const seuil = await screen.findByLabelText('Seuil de retard de signature (jours)');
    expect(seuil).toHaveAccessibleDescription(expect.stringContaining('Entre 1 et 90 jours.'));
    expect(screen.getByLabelText('1er rappel (jours)')).toHaveAccessibleDescription(expect.stringContaining('Entre 1 et 90 jours.'));
    expect(screen.getByLabelText('Rappel avant restitution (jours)')).toHaveAccessibleDescription(
      expect.stringContaining('Entre 0 et 90 jours'),
    );
  });

  it('après rechargement, rappelle la valeur appliquée d’un seuil saisi', async () => {
    renderWith(
      { signature_overdue_days: '30' },
      [entry('signature_overdue_days', { storedValue: '30', appliedValue: 30, source: 'stored' })],
    );

    expect(await screen.findByText('Valeur appliquée : 30')).toBeInTheDocument();
  });

  it('signale un seuil déjà enregistré au-delà de 90 jours, ramené à 90', async () => {
    renderWith(
      { signature_overdue_days: '500' },
      [entry('signature_overdue_days', { storedValue: '500', appliedValue: 90, source: 'stored', adjusted: true })],
    );

    expect(
      await screen.findByText('La valeur saisie (500) est hors des bornes : valeur appliquée 90 (maximum).'),
    ).toBeInTheDocument();
  });
});
