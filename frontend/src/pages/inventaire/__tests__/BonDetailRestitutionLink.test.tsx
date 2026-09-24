/**
 * Lien profond de l'inventaire `/bons/:id?action=restitution` (action
 * « Initier la restitution » d'une ligne, cf. InventoryRowActions) : la fiche
 * du bon ouvre la boîte de dialogue de restitution à l'arrivée. Testé ici,
 * avec l'action qui le produit ; la fiche est isolée de ses sous-composants
 * et de ses appels réseau (useBonActions simulé).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { BonDetailPage } from '@/pages/bons/BonDetail';

const setShowRestitutionModal = vi.fn();
const toastMock = vi.fn();
let bonStatus = 'active';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'technician', isItStaff: true }, loading: false, refetch: vi.fn(), logout: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock('@/pages/bons/detail/useBonActions', () => ({
  useBonActions: () => ({
    bon: {
      id: 'b1',
      status: bonStatus,
      civilite: 'mr',
      collaborateurEmail: 'jean@example.com',
      equipments: [],
      signatures: [],
      notes: null,
    },
    loading: false,
    loadError: null,
    actionLoading: null,
    pdfLoading: null,
    pdfSnapshots: [],
    notifLogs: [],
    load: vi.fn(),
    setShowRestitutionModal,
  }),
}));

function Stub() {
  return null;
}
vi.mock('@/pages/bons/detail/BonDetailHeader', () => ({ BonDetailHeader: Stub }));
vi.mock('@/pages/bons/detail/BonInfoCards', () => ({ BonInfoCards: Stub }));
vi.mock('@/pages/bons/detail/BonSignatures', () => ({ BonSignatures: Stub }));
vi.mock('@/pages/bons/detail/BonEquipmentTable', () => ({ BonEquipmentTable: Stub }));
vi.mock('@/pages/bons/detail/BonNotesCard', () => ({ BonNotesCard: Stub }));
vi.mock('@/pages/bons/detail/BonPdfSnapshots', () => ({ BonPdfSnapshots: Stub }));
vi.mock('@/pages/bons/detail/BonAttachments', () => ({ BonAttachments: Stub }));
vi.mock('@/pages/bons/detail/BonIntegrity', () => ({ BonIntegrity: Stub }));
vi.mock('@/pages/bons/detail/BonNotificationLogs', () => ({ BonNotificationLogs: Stub }));
vi.mock('@/pages/bons/detail/BonModals', () => ({ BonModals: Stub }));

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <>
      <BonDetailPage />
      <LocationProbe />
    </>,
    { route, path: '/bons/:id' },
  );
}

describe('BonDetailPage — lien profond ?action=restitution', () => {
  beforeEach(() => {
    setShowRestitutionModal.mockClear();
    toastMock.mockClear();
    bonStatus = 'active';
  });

  it('ouvre la boîte de dialogue de restitution puis retire le paramètre de l’URL', async () => {
    renderAt('/bons/b1?action=restitution');

    await waitFor(() => expect(setShowRestitutionModal).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/bons\/b1$/));
  });

  it('n’ouvre rien sans le paramètre', async () => {
    renderAt('/bons/b1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(setShowRestitutionModal).not.toHaveBeenCalled();
  });

  it('prévient au lieu d’ouvrir quand le statut du bon ne permet pas la restitution', async () => {
    bonStatus = 'sent_mise_dispo';
    renderAt('/bons/b1?action=restitution');

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Restitution impossible' })));
    expect(setShowRestitutionModal).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/bons\/b1$/));
  });
});
