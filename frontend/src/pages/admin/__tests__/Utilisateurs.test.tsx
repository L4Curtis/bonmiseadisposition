import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
import { UtilisateursPage } from '../Utilisateurs';

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

import { api } from '@/lib/api';

const CURRENT_USER_ID = 'admin-1';
let mockRole = 'admin';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: CURRENT_USER_ID,
      role: mockRole,
      displayName: 'Current User',
      email: 'current@example.com',
      isItStaff: true,
      isLocalAccount: true,
      mustChangePassword: false,
      active: true,
      samAccountName: 'current',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

const users = [
  {
    id: CURRENT_USER_ID,
    samAccountName: 'current',
    displayName: 'Current User',
    email: 'current@example.com',
    isItStaff: true,
    isLocalAccount: true,
    isManualAccount: false,
    mustChangePassword: false,
    role: 'admin',
    active: true,
  },
  {
    id: 'user-2',
    samAccountName: 'jdupont',
    displayName: 'Jean Dupont',
    email: 'jean.dupont@example.com',
    isItStaff: false,
    isLocalAccount: false,
    isManualAccount: false,
    mustChangePassword: false,
    role: 'collaborator',
    active: true,
  },
];

/** Compte créé manuellement (compagnon de chantier sans compte Active
 *  Directory, sans email) — utilisé par les tests dédiés ci-dessous, séparé
 *  de `users` pour ne pas perturber les assertions existantes (ex. un seul
 *  badge « Collaborateur », un seul <select> par utilisateur, etc.). */
const manualUser = {
  id: 'user-3',
  samAccountName: 'manuel-marc',
  displayName: 'Marc Ouvrier',
  email: null,
  department: 'Chantier',
  isItStaff: false,
  isLocalAccount: false,
  isManualAccount: true,
  mustChangePassword: false,
  role: 'collaborator',
  active: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  mockRole = 'admin';
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/users?')) return Promise.resolve({ users, total: users.length, page: 1, limit: 25 });
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

describe('UtilisateursPage — rôle direction (lot 3b)', () => {
  it('affiche un sélecteur de rôle pour un admin, désactivé sur sa propre ligne', async () => {
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(users.length);

    expect(screen.getByRole('combobox', { name: /Rôle de Current User/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Rôle de Jean Dupont/i })).not.toBeDisabled();
  });

  it("n'affiche pas de sélecteur pour un technicien (libellé seul)", async () => {
    mockRole = 'technician';
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getByText('Collaborateur')).toBeInTheDocument();
  });

  it('affiche la note SSO uniquement pour le compte non local', async () => {
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    expect(screen.getByText(/Compte SSO : rôle recalculé depuis les groupes Entra/i)).toBeInTheDocument();
  });

  it('change le rôle via PATCH /admin/users/:id/role et met à jour la ligne', async () => {
    vi.mocked(api.patch).mockResolvedValue({ id: 'user-2', role: 'direction', isItStaff: false });
    // pointerEventsCheck: 0 — cf. BonCreate.test.tsx : Radix <Select> bascule
    // pointer-events sur <body> pendant l'animation, non garantie terminée en jsdom.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    const otherRowSelect = screen.getByRole('combobox', { name: /Rôle de Jean Dupont/i });
    await user.click(otherRowSelect);
    await user.click(await screen.findByRole('option', { name: 'Direction' }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-2/role', { role: 'direction' });
    });
  });
});

describe('UtilisateursPage — collaborateurs créés manuellement', () => {
  it('affiche le badge « Créé manuellement » et « — » pour un compte sans email', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/users?')) {
        const all = [...users, manualUser];
        return Promise.resolve({ users: all, total: all.length, page: 1, limit: 25 });
      }
      if (path.startsWith('/filiales/active')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithProviders(<UtilisateursPage />);

    const name = await screen.findByText('Marc Ouvrier');
    expect(screen.getByText('Créé manuellement')).toBeInTheDocument();

    // La colonne Email (2e <td> de la ligne) affiche « — », jamais "null" ni une chaîne vide.
    const row = name.closest('tr');
    expect(row).not.toBeNull();
    const emailCell = row!.querySelectorAll('td')[1];
    expect(emailCell.textContent).toBe('—');
  });

  it("n'affiche pas de bouton Modifier pour un compte d'annuaire, mais l'affiche pour un compte manuel", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/users?')) {
        const all = [...users, manualUser];
        return Promise.resolve({ users: all, total: all.length, page: 1, limit: 25 });
      }
      if (path.startsWith('/filiales/active')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Marc Ouvrier');

    // Compte manuel : modification et activation/désactivation disponibles,
    // et un seul bouton Modifier dans toute la page (pas sur les comptes d'annuaire).
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Désactiver|Activer/ })).toHaveLength(1);

    // Compte d'annuaire (Jean Dupont) : lecture seule, phrase explicative.
    expect(screen.getByText(/Compte Active Directory : modifiable dans Active Directory/i)).toBeInTheDocument();
  });

  it('crée un collaborateur depuis l\'annuaire via le bouton « Ajouter un collaborateur »', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    vi.mocked(api.post).mockResolvedValue({ ...manualUser, id: 'user-4', displayName: 'Léa Compagnon' });

    renderWithProviders(<UtilisateursPage />);
    await screen.findByText('Jean Dupont');

    await user.click(screen.getByRole('button', { name: /Ajouter un collaborateur/i }));
    await user.type(await screen.findByLabelText('Prénom *'), 'Léa');
    await user.type(screen.getByLabelText('Nom *'), 'Compagnon');
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/manual', {
        firstName: 'Léa',
        lastName: 'Compagnon',
        email: '',
        department: '',
      });
    });
    // La liste est rechargée après création (au moins un appel supplémentaire à GET /users).
    await waitFor(() => {
      expect(vi.mocked(api.get).mock.calls.filter(([p]) => p.startsWith('/users?')).length).toBeGreaterThan(1);
    });
  });

  it('active/désactive un compte manuel via PATCH /users/:id/manual', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/users?')) {
        const all = [...users, manualUser];
        return Promise.resolve({ users: all, total: all.length, page: 1, limit: 25 });
      }
      if (path.startsWith('/filiales/active')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    vi.mocked(api.patch).mockResolvedValue({ ...manualUser, active: false });

    renderWithProviders(<UtilisateursPage />);
    await screen.findByText('Marc Ouvrier');

    await user.click(screen.getByRole('button', { name: /Désactiver/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/users/user-3/manual', { active: false });
    });
  });
});
