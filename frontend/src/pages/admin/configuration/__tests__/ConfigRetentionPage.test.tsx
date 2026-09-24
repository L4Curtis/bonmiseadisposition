import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ConfigRetentionPage } from '../ConfigRetentionPage';
import { durationError, initialDurationValues, RETENTION_DURATIONS } from '../retention/retention-durations';
import { isSimulationFresh, SIMULATION_MAX_AGE_MS, type RetentionSimulation } from '../retention/retention-api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getBlob: vi.fn(),
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

vi.mock('@/hooks/use-config-health', () => ({ refreshConfigHealth: vi.fn() }));

import { api } from '@/lib/api';

const PREVIEW = {
  eligible: 12, anonymized: 0, attachmentsPurged: 0, oldAttachmentsPurged: 7,
  cutoff: '2021-09-24T00:00:00.000Z', dryRun: true,
};
const STATS = {
  enabled: false,
  config: { expiredTokensDays: 30, auditLogsYears: 5, attachmentMonths: 24 },
  purgeable: { expiredTokens: 4, oldAuditLogs: 321, oldAttachments: 7 },
  totals: { auditLogs: 5000, signatures: 90 },
};

function mockApi(config: Record<string, string>) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/admin/config/retention') return Promise.resolve(config);
    if (path === '/admin/retention/preview') return Promise.resolve(PREVIEW);
    if (path === '/admin/retention/stats') return Promise.resolve(STATS);
    return Promise.resolve(null);
  });
  vi.mocked(api.put).mockResolvedValue({ success: true });
  vi.mocked(api.post).mockResolvedValue({ ...PREVIEW, eligible: 12 });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('retention-durations', () => {
  const anonymize = RETENTION_DURATIONS.find((d) => d.key === 'anonymize_months')!;
  const tokens = RETENTION_DURATIONS.find((d) => d.key === 'expired_tokens_days')!;

  it('refuse une anonymisation sous le plancher légal de 60 mois', () => {
    expect(durationError(anonymize, '59')).toBe('Minimum légal : 60 mois.');
    expect(durationError(anonymize, '60')).toBeNull();
  });

  it('refuse une saisie non entière ou vide', () => {
    expect(durationError(tokens, '')).toBe('Saisissez un nombre entier.');
    expect(durationError(tokens, '2.5')).toBe('Saisissez un nombre entier.');
    expect(durationError(tokens, '0')).toBe('Minimum : 1 jours.');
  });

  it('propose les valeurs appliquées par défaut par le serveur, sauf valeur déjà enregistrée', () => {
    expect(initialDurationValues({ audit_logs_years: '7' })).toEqual({
      anonymize_months: '60',
      attachment_months: '24',
      expired_tokens_days: '30',
      audit_logs_years: '7',
    });
  });

  it('tient une simulation pour valable moins de 24 h', () => {
    const sim = { simulatedAt: 1_000 } as RetentionSimulation;
    expect(isSimulationFresh(sim, 1_000 + SIMULATION_MAX_AGE_MS - 1)).toBe(true);
    expect(isSimulationFresh(sim, 1_000 + SIMULATION_MAX_AGE_MS)).toBe(false);
    expect(isSimulationFresh(null)).toBe(false);
  });
});

describe('ConfigRetentionPage — première configuration', () => {
  it('guide jusqu’à l’activation : durées, simulation, puis seulement activation', async () => {
    mockApi({});
    const { user } = renderWithProviders(<ConfigRetentionPage />);

    expect(await screen.findByText('Rétention RGPD — première configuration')).toBeInTheDocument();
    expect(screen.getByText(/Plancher légal : 60 mois/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Suivant/ }));

    // Étape 2 : il faut enregistrer avant de pouvoir simuler.
    expect(screen.getByRole('button', { name: /Suivant/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Enregistrer ces durées/ }));
    expect(api.put).toHaveBeenCalledWith('/admin/config/retention', {
      anonymize_months: '60',
      attachment_months: '24',
      expired_tokens_days: '30',
      audit_logs_years: '5',
    });

    // Étape 3 : la simulation est un dry-run, jamais un lancement réel.
    expect(await screen.findByRole('heading', { name: '3. Simuler' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Suivant/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Lancer la simulation/ }));
    expect(api.post).toHaveBeenCalledWith('/admin/retention/run', { dryRun: true });
    expect(api.post).not.toHaveBeenCalledWith('/admin/retention/run', { dryRun: false });
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('321')).toBeInTheDocument();

    // Étape 4 : activation après confirmation du référent RGPD.
    await user.click(screen.getByRole('button', { name: /Suivant/ }));
    const activate = screen.getByRole('button', { name: /Activer la rétention automatique/ });
    expect(activate).toBeDisabled();
    await user.click(screen.getByLabelText('Ces durées ont été validées avec le référent RGPD.'));
    await user.click(activate);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/config/retention', { enabled: 'true' }));
  });

  it('bloque l’enregistrement d’une anonymisation sous 60 mois', async () => {
    mockApi({});
    const { user } = renderWithProviders(<ConfigRetentionPage />);

    await user.click(await screen.findByRole('button', { name: /Suivant/ }));
    const input = screen.getByLabelText('Anonymisation des bons (mois)');
    await user.clear(input);
    await user.type(input, '36');

    expect(screen.getByText('Minimum légal : 60 mois.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer ces durées/ })).toBeDisabled();
  });

  it('invalide la simulation quand les durées changent', async () => {
    mockApi({ anonymize_months: '60', attachment_months: '24', expired_tokens_days: '30', audit_logs_years: '5' });
    const { user } = renderWithProviders(<ConfigRetentionPage />);

    await user.click(await screen.findByRole('button', { name: /Suivant/ }));
    // Durées déjà enregistrées : on peut passer directement à la simulation.
    await user.click(screen.getByRole('button', { name: /Suivant/ }));
    await user.click(screen.getByRole('button', { name: /Lancer la simulation/ }));
    await screen.findByText('12');

    await user.click(screen.getByRole('button', { name: /Retour/ }));
    const input = screen.getByLabelText('Purge des pièces jointes (mois)');
    await user.clear(input);
    await user.type(input, '36');
    expect(screen.getByRole('button', { name: /Suivant/ })).toBeDisabled();
  });
});

describe('ConfigRetentionPage — rétention active', () => {
  it('affiche les réglages courants, sans parcours guidé', async () => {
    mockApi({ enabled: 'true', anonymize_months: '72' });
    renderWithProviders(<ConfigRetentionPage />);

    expect(await screen.findByRole('switch', { name: /Anonymisation automatique/ })).toBeInTheDocument();
    expect(screen.queryByText('Rétention RGPD — première configuration')).not.toBeInTheDocument();
  });
});
