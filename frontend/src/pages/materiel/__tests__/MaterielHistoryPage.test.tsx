import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MaterielHistoryPage } from '../MaterielHistoryPage';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), getList: vi.fn(), getBlob: vi.fn(), getFile: vi.fn() } };
});

// État mutable partagé avec le mock (vi.hoisted : accessible depuis la
// factory hoistée ET depuis les tests, pour changer de rôle sans re-mocker).
const authState = vi.hoisted(() => ({ role: 'admin' as string }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: authState.role }, loading: false, refetch: vi.fn(), logout: vi.fn() }),
}));

import { api } from '@/lib/api';

/**
 * Ces cas reprennent ceux de l'ancienne SerialHistoryModal.test.tsx (modale
 * supprimée au lot L1, remplacée par cette page dédiée /materiel/:reference) :
 * rendu des entrées, troncature signalée, état vide, erreur lisible.
 */
function entree(reference: string, bonId: string, overrides: Record<string, unknown> = {}) {
  return {
    equipmentId: `e-${bonId}`,
    serialNumber: 'SN-123',
    inventoryNumber: null,
    label: 'Laptop',
    returnedAt: null,
    notReturned: false,
    holding: 'with_collaborateur',
    bon: {
      id: bonId,
      reference,
      status: 'active',
      dateMiseDisposition: '2026-01-05T00:00:00.000Z',
      dateRestitution: null,
      collaborateur: { displayName: 'Jean Dupont', email: 'jean@x.fr' },
      filiale: { displayName: 'Siège' },
    },
    ...overrides,
  };
}

function renderPage(reference = 'SN-123', search = '') {
  return renderWithProviders(<MaterielHistoryPage />, {
    route: `/materiel/${reference}${search}`,
    path: '/materiel/:reference',
  });
}

/** Une page de l'historique, à la forme commune des listes. */
function listPage(items: unknown[], total = items.length, page = 1) {
  return { items, total, page, limit: 25, truncated: false };
}

beforeEach(() => {
  vi.resetAllMocks();
  authState.role = 'admin';
});

describe('MaterielHistoryPage', () => {
  it('affiche les bons renvoyés dans items', async () => {
    vi.mocked(api.getList).mockResolvedValue(listPage([entree('BON-2026-0001', 'b1'), entree('BON-2026-0002', 'b2')], 2));

    renderPage();

    expect(await screen.findByText('BON-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('BON-2026-0002')).toBeInTheDocument();
  });

  it('pagine l’historique : 25 bons par page par défaut, avec le compte réel', async () => {
    vi.mocked(api.getList).mockResolvedValue(listPage([entree('BON-2026-0001', 'b1')], 250));

    renderPage();

    expect(await screen.findByText('1–25 sur 250 bons')).toBeInTheDocument();
    expect(api.getList).toHaveBeenCalledWith('/equipment/history?q=SN-123&page=1&limit=25');
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeEnabled();
  });

  it('arrivée sur la page 2 : la liste de la page 2, l’état actuel lu sur les bons les plus récents', async () => {
    vi.mocked(api.getList).mockImplementation(async (path: string) =>
      path.includes('page=2')
        ? listPage([entree('BON-2026-0001', 'b1', { holding: 'returned', returnedAt: '2025-01-01T10:00:00.000Z' })], 30, 2)
        : listPage([entree('BON-2026-0040', 'b40')], 30),
    );

    renderPage('SN-123', '?page=2');

    expect(await screen.findByText('BON-2026-0001')).toBeInTheDocument();
    expect(await screen.findByText(/Chez Jean Dupont depuis le/)).toBeInTheDocument();
    expect(screen.queryByText('BON-2026-0040')).not.toBeInTheDocument();
  });

  it('affiche un état vide clair quand la référence est inconnue', async () => {
    vi.mocked(api.getList).mockResolvedValue(listPage([], 0));

    renderPage('SN-INCONNU');

    expect(await screen.findByText(/Aucun bon ne référence/i)).toBeInTheDocument();
    expect(screen.getByText('SN-INCONNU')).toBeInTheDocument();
  });

  it('affiche une erreur lisible quand l’appel échoue', async () => {
    vi.mocked(api.getList).mockRejectedValue(new Error('Erreur HTTP 500'));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur HTTP 500');
  });

  it('affiche l\'état actuel « en circulation » et le bouton export quand le matériel n\'est pas rendu', async () => {
    vi.mocked(api.getList).mockResolvedValue(listPage([entree('BON-2026-0001', 'b1')], 1));

    renderPage();

    expect(await screen.findByText(/Chez Jean Dupont depuis le/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter CSV/i })).toBeInTheDocument();
  });

  it('export : annonce le nombre de bons, le numéro et le plafond du serveur avant de télécharger', async () => {
    vi.mocked(api.getList).mockResolvedValue({ ...listPage([entree('BON-2026-0001', 'b1')], 6200), meta: { exportLimit: 5000 } });
    vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['a;b'], { type: 'text/csv' }), filename: 'h.csv', truncated: true });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Exporter CSV' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('6 200 bons à exporter.');
    expect(dialog).toHaveTextContent('Filtres : Numéro : SN-123');
    expect(dialog).toHaveTextContent('limité à 5 000 lignes');
    expect(api.getFile).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /Exporter les 5\s000 premières lignes/ }));
    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith('/equipment/history/export?q=SN-123'));
    // Après : le fichier coupé reste signalé par un bandeau.
    expect(await screen.findByText(/ne contient que les 5 000 premières lignes sur 6 200/)).toBeInTheDocument();
    click.mockRestore();
  });

  it('affiche « déclaré non rendu » quand le dernier bon l\'indique', async () => {
    vi.mocked(api.getList).mockResolvedValue(listPage([entree('BON-2026-0001', 'b1', { notReturned: true, holding: 'not_returned' })], 1));

    renderPage();

    expect(await screen.findByText('Déclaré non restitué par Jean Dupont')).toBeInTheDocument();
  });

  it("ne dit jamais « Chez X » pour un brouillon : l'équipement est seulement prévu", async () => {
    vi.mocked(api.getList).mockResolvedValue(listPage([
        entree('BON-2026-0019', 'b2', { holding: 'planned', bon: { ...entree('x', 'b2').bon, status: 'draft', collaborateur: { displayName: 'Karim Haddad', email: null } } }),
        entree('BON-2026-0003', 'b1', { holding: 'returned', returnedAt: '2026-06-01T10:00:00.000Z' }),
      ], 2));

    renderPage();

    expect(await screen.findByText(/^Rendu le 01\/06\/2026 par Jean Dupont$/)).toBeInTheDocument();
    expect(screen.queryByText(/Chez Karim Haddad/)).not.toBeInTheDocument();
  });

  it("n'ayant qu'un brouillon, l'équipement est « prévu pour », jamais « chez »", async () => {
    vi.mocked(api.getList).mockResolvedValue(listPage([entree('BON-2026-0019', 'b2', { holding: 'planned' })], 1));

    renderPage();

    expect(await screen.findByText("Prévu pour Jean Dupont (brouillon, rien n'a été remis)")).toBeInTheDocument();
  });

  it('ne rend pas la référence de bon cliquable pour la direction (canLinkToBon=false)', async () => {
    authState.role = 'direction';
    vi.mocked(api.getList).mockResolvedValue(listPage([entree('BON-2026-0001', 'b1')], 1));

    renderPage();

    const reference = await screen.findByText('BON-2026-0001');
    expect(reference.tagName).not.toBe('A');
  });
});
