import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { ConfigRegistryEntry } from '@/contracts/config-registry';
import { ConfigSection } from '../ConfigSection';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), getList: vi.fn(), post: vi.fn(), put: vi.fn() } };
});
vi.mock('@/hooks/use-config-health', () => ({ refreshConfigHealth: vi.fn() }));

import { api } from '@/lib/api';

function entry(name: string, overrides: Partial<ConfigRegistryEntry>): ConfigRegistryEntry {
  return {
    key: `rappels.${name}`, category: 'rappels', name, label: name, type: 'integer', min: 1, max: null,
    secret: false, adminOnly: true, healthSection: 'rappels', storedValue: null, defaultValue: null,
    appliedValue: null, source: 'default', adjusted: false, ...overrides,
  };
}

const REGISTRY = [
  entry('enabled', { type: 'boolean', min: null, defaultValue: true, appliedValue: true }),
  entry('delay_1', { defaultValue: 3, appliedValue: 3 }),
  entry('delay_2', { storedValue: '0', appliedValue: 1, source: 'stored', adjusted: true }),
];

function renderSection(stored: Record<string, string | null>, onTest?: () => Promise<{ ok: boolean; message: string }>) {
  vi.mocked(api.get).mockResolvedValue(stored);
  vi.mocked(api.getList).mockResolvedValue({ items: REGISTRY, total: 3, page: 1, limit: 3, truncated: false } as never);
  return renderWithProviders(
    <ConfigSection
      title="Rappels automatiques"
      category="rappels"
      onTest={onTest}
      testLabel={onTest ? 'Tester' : undefined}
      fields={[
        { key: 'enabled', label: 'Activé', toggle: true },
        { key: 'delay_1', label: '1er rappel (jours)', type: 'number' },
        { key: 'delay_2', label: '2e rappel (jours)', type: 'number' },
      ]}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ConfigSection', () => {
  it('affiche la valeur appliquée par défaut sous un réglage vide, sans la faire passer pour une saisie (R-104)', async () => {
    renderSection({ delay_2: '0' });

    expect(await screen.findByText('Valeur appliquée : 3 (par défaut)')).toBeInTheDocument();
    expect(screen.getByLabelText('1er rappel (jours)')).toHaveValue(null);
    expect(screen.getByLabelText('1er rappel (jours)')).not.toHaveAttribute('placeholder');
  });

  it('signale une saisie hors bornes ramenée à la borne', async () => {
    renderSection({ delay_2: '0' });

    expect(await screen.findByText('La valeur saisie (0) est hors des bornes : valeur appliquée 1 (minimum).')).toBeInTheDocument();
  });

  it('montre un interrupteur jamais enregistré dans l’état que le serveur applique (activé par défaut)', async () => {
    renderSection({});

    const toggle = await screen.findByRole('switch', { name: 'Activé' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByText('Valeur appliquée : activé (par défaut)')).toBeInTheDocument();
  });

  it('enregistre la rubrique puis relit les valeurs appliquées', async () => {
    renderSection({});
    vi.mocked(api.put).mockResolvedValue({ ok: true });

    fireEvent.change(await screen.findByLabelText('1er rappel (jours)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/config/rappels', { enabled: '', delay_1: '5', delay_2: '' }));
    await waitFor(() => expect(api.getList).toHaveBeenCalledTimes(2));
  });

  it('affiche l’échec d’un test de connexion avec son message', async () => {
    renderSection({}, () => Promise.resolve({ ok: false, message: 'Serveur injoignable' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Tester' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Serveur injoignable');
  });
});
