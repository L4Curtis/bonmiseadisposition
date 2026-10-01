import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
      getList: vi.fn(),
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
import { toListResponse } from '@/lib/api-envelope';

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

/** Réponse de GET /users : la liste paginée commune, avec l'état de l'annuaire. */
function usersPage(items: unknown[], directoryActive = true) {
  return { items, total: items.length, page: 1, limit: 25, truncated: false, meta: { directoryActive } };
}

function serveUsers(items: unknown[], directoryActive = true) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/users?')) return Promise.resolve(usersPage(items, directoryActive));
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  mockRole = 'admin';
  // Les listes passent par `api.getList`, qui lit la réponse de `api.get`.
  vi.mocked(api.getList).mockImplementation(async (path: string) => toListResponse(await api.get(path)));
  serveUsers(users);
});

describe('UtilisateursPage — rôle direction (lot 3b)', () => {
  it('affiche un sélecteur de rôle pour un admin, désactivé sur sa propre ligne', async () => {
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');

    const selects = screen.getAllByRole('combobox', { name: /Rôle de/ });
    expect(selects).toHaveLength(users.length);

    expect(screen.getByRole('combobox', { name: /Rôle de Current User/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Rôle de Jean Dupont/i })).not.toBeDisabled();
  });

  it("n'affiche pas de sélecteur pour un technicien (libellé seul)", async () => {
    mockRole = 'technician';
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    expect(screen.queryAllByRole('combobox', { name: /Rôle de/ })).toHaveLength(0);
    expect(screen.getByText('Collaborateur')).toBeInTheDocument();
  });

  it('affiche la note SSO uniquement pour le compte non local', async () => {
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    expect(screen.getByText(/Compte SSO : rôle recalculé depuis les groupes Entra/i)).toBeInTheDocument();
  });

  it('change le rôle via PATCH /users/:id/role et met à jour la ligne', async () => {
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
      expect(api.patch).toHaveBeenCalledWith('/users/user-2/role', { role: 'direction' });
    });
  });
});

describe('UtilisateursPage — collaborateurs créés manuellement', () => {
  it('affiche le badge « Créé manuellement » et « — » pour un compte sans email', async () => {
    serveUsers([...users, manualUser]);

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
    serveUsers([...users, manualUser]);

    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Marc Ouvrier');

    // Compte manuel : modification et désactivation disponibles, et un seul
    // bouton Modifier dans toute la page (pas sur les comptes d'annuaire).
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Désactiver le compte de Marc Ouvrier' })).toBeInTheDocument();

    // Annuaire actif : le compte d'annuaire (Jean Dupont) renvoie vers Active Directory.
    expect(screen.queryByRole('button', { name: 'Désactiver le compte de Jean Dupont' })).not.toBeInTheDocument();
    expect(screen.getByText(/Compte Active Directory : se modifie et se désactive dans Active Directory/i)).toBeInTheDocument();
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

  it('désactive un compte manuel après confirmation, via POST /users/:id/deactivate', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    serveUsers([...users, manualUser]);
    vi.mocked(api.post).mockResolvedValue({ ...manualUser, active: false });

    renderWithProviders(<UtilisateursPage />);
    await screen.findByText('Marc Ouvrier');

    await user.click(screen.getByRole('button', { name: 'Désactiver le compte de Marc Ouvrier' }));
    expect(api.post).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Désactiver' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users/user-3/deactivate'));
    expect(await screen.findByText('Inactif')).toBeInTheDocument();
  });
});

describe('UtilisateursPage — annuaire inactif (R-107)', () => {
  it('propose de désactiver un compte venu d’Active Directory, avec une confirmation qui le dit', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    serveUsers(users, false);
    vi.mocked(api.post).mockResolvedValue({ ...users[1], active: false });

    renderWithProviders(<UtilisateursPage />);
    await screen.findByText('Jean Dupont');

    expect(screen.getByText(/L'annuaire Active Directory n'est pas synchronisé/)).toBeInTheDocument();
    // Jamais sur son propre compte.
    expect(screen.queryByRole('button', { name: 'Désactiver le compte de Current User' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Désactiver le compte de Jean Dupont' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Ce compte vient d'Active Directory/);
    await user.click(within(dialog).getByRole('button', { name: 'Désactiver' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users/user-2/deactivate'));
  });

  it('réactive un compte désactivé sans confirmation, via POST /users/:id/reactivate', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    serveUsers([{ ...users[1], active: false }], false);
    vi.mocked(api.post).mockResolvedValue({ ...users[1], active: true });

    renderWithProviders(<UtilisateursPage />);
    await user.click(await screen.findByRole('button', { name: 'Réactiver le compte de Jean Dupont' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users/user-2/reactivate'));
  });
});

describe('UtilisateursPage — liste', () => {
  it('demande la première page de 25 comptes actifs, puis filtre l’état sur demande', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithProviders(<UtilisateursPage />);
    await screen.findByText('Jean Dupont');

    expect(api.getList).toHaveBeenCalledWith('/users?page=1&limit=25&status=active');

    await user.selectOptions(screen.getByRole('combobox', { name: 'État des comptes' }), 'inactive');
    await waitFor(() => expect(api.getList).toHaveBeenCalledWith('/users?page=1&limit=25&status=inactive'));
  });

  it('déverrouille un compte local via POST /users/:id/unlock', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    serveUsers([{ ...users[1], id: 'loc-1', displayName: 'Lucie Locale', isLocalAccount: true }]);
    vi.mocked(api.post).mockResolvedValue({ unlocked: true, failedAttempts: 3 });

    renderWithProviders(<UtilisateursPage />);
    await user.click(await screen.findByRole('button', { name: 'Déverrouiller' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users/loc-1/unlock'));
  });
});
