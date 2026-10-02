import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ConfigLdapPage } from '../ConfigLdapPage';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), getList: vi.fn(), post: vi.fn(), put: vi.fn() } };
});
vi.mock('@/hooks/use-config-health', () => ({ refreshConfigHealth: vi.fn() }));

import { api } from '@/lib/api';

const STORED = {
  enabled: 'true',
  use_ssl: 'false',
  url: 'ldap://ancien.livio.local',
  bind_dn: 'CN=ancien,DC=livio,DC=local',
  bind_password: '••••••••',
  search_base: 'DC=livio,DC=local',
  user_filter: null,
  sync_interval_hours: '12',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue(STORED);
  vi.mocked(api.getList).mockResolvedValue({ items: [], total: 0, page: 1, limit: 0, truncated: false } as never);
  vi.mocked(api.post).mockResolvedValue({ ok: true, message: 'Connexion à l’annuaire réussie.' });
});

async function typeIn(label: string, value: string) {
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });
}

describe('ConfigLdapPage — test de connexion', () => {
  it('teste les valeurs saisies, non enregistrées, sans renvoyer le mot de passe masqué ni enregistrer', async () => {
    renderWithProviders(<ConfigLdapPage />);
    await typeIn('URL LDAP', 'ldaps://dc02.livio.local:636');
    fireEvent.click(screen.getByRole('switch', { name: 'SSL/TLS' }));
    await typeIn('Bind DN', 'CN=svc,DC=livio,DC=local');

    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion LDAP' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/config/test/ldap', {
        url: 'ldaps://dc02.livio.local:636',
        use_ssl: 'true',
        bind_dn: 'CN=svc,DC=livio,DC=local',
        user_filter: '',
      }),
    );
    expect(await screen.findByText('Connexion à l’annuaire réussie.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('envoie le mot de passe quand il a été retapé', async () => {
    renderWithProviders(<ConfigLdapPage />);
    await typeIn('Mot de passe', 'nouveau-secret');

    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion LDAP' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/admin/config/test/ldap',
        expect.objectContaining({ bind_password: 'nouveau-secret', url: 'ldap://ancien.livio.local' }),
      ),
    );
  });

  it('annonce les bornes de la fréquence de synchronisation', async () => {
    renderWithProviders(<ConfigLdapPage />);
    expect(await screen.findByText(/Entre 1 et 168 heures/)).toBeInTheDocument();
  });
});
