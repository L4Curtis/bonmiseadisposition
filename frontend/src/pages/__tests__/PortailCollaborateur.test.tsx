import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PortailCollaborateur } from '../PortailCollaborateur';

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

const future = new Date(Date.now() + 86_400_000).toISOString();

const bonWithLink = {
  id: 'b1',
  reference: 'BDM-1',
  status: 'partially_returned',
  civilite: 'mr',
  dateMiseDisposition: '2026-01-01',
  filiale: { displayName: 'Siège' },
  equipments: [{ id: 'e1' }],
  signatures: [{ id: 's1', type: 'restitution', signed: false, token: 'tok-1', tokenExpiresAt: future, isInPerson: false }],
};

const bonInPerson = {
  id: 'b2',
  reference: 'BDM-2',
  status: 'sent_mise_dispo',
  civilite: 'mme',
  dateMiseDisposition: '2026-01-02',
  filiale: { displayName: 'Siège' },
  equipments: [{ id: 'e2' }],
  signatures: [{ id: 's2', type: 'mise_disposition', signed: false, token: 'tok-2', tokenExpiresAt: future, isInPerson: true }],
};

const bonActive = {
  id: 'b3',
  reference: 'BDM-3',
  status: 'active',
  civilite: 'mr',
  dateMiseDisposition: '2026-01-03',
  filiale: { displayName: 'Siège' },
  equipments: [{ id: 'e3' }],
  signatures: [],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PortailCollaborateur', () => {
  it('lists a partially_returned bon with a pending, non-expired restitution signature under "À signer" with a sign link', async () => {
    vi.mocked(api.get).mockResolvedValue([bonWithLink]);

    renderWithProviders(<PortailCollaborateur />);

    await screen.findByText('BDM-1');
    expect(screen.getByText(/À signer \(1\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /signer maintenant/i })).toHaveAttribute('href', '/signer/tok-1');
  });

  it('shows an in-person notice instead of a link for a pending in-person signature', async () => {
    vi.mocked(api.get).mockResolvedValue([bonInPerson]);

    renderWithProviders(<PortailCollaborateur />);

    await screen.findByText('BDM-2');
    expect(screen.queryByRole('link', { name: /signer maintenant/i })).not.toBeInTheDocument();
    expect(screen.getByText(/présentiel/i)).toBeInTheDocument();
  });

  it('lists an active bon with no pending signature under "En cours", not "À signer"', async () => {
    vi.mocked(api.get).mockResolvedValue([bonActive]);

    renderWithProviders(<PortailCollaborateur />);

    await screen.findByText('BDM-3');
    expect(screen.getByText(/En cours \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/À signer/)).not.toBeInTheDocument();
  });

  it('shows a banner with the count of documents pending signature', async () => {
    vi.mocked(api.get).mockResolvedValue([bonWithLink, bonInPerson, bonActive]);

    renderWithProviders(<PortailCollaborateur />);

    expect(await screen.findByText('Vous avez 2 documents à signer.')).toBeInTheDocument();
  });
});
