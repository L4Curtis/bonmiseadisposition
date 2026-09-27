import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MyContestation } from '@/contracts/contestations';
import { MyContestationCard } from '../MyContestationCard';

const FOUNDED_RESTITUTION: MyContestation = {
  id: 'c1',
  bon: { id: 'b1', reference: 'BON-2026-0025' },
  contestedDocument: 'restitution',
  message: "Je n'ai jamais rendu le casque.",
  status: 'resolved',
  outcome: 'founded',
  createdAt: '2026-09-22T10:00:00Z',
  reviewedAt: '2026-09-23T10:00:00Z',
  resolvedAt: '2026-09-27T10:00:00Z',
  resolutionMessage: 'Vous avez raison.',
  replacementBon: null,
};

const OUTCOME = 'Votre bon va être corrigé, puis la restitution vous sera renvoyée à signer.';

describe('MyContestationCard — suite d’une contestation Fondée', () => {
  it('dit ce qui va suivre quand rien d’autre ne le dit', () => {
    render(<MyContestationCard contestation={FOUNDED_RESTITUTION} />);
    expect(screen.getByText(OUTCOME)).toBeInTheDocument();
  });

  it('document en cours de correction annoncé juste au-dessus : pas deux fois la même phrase', () => {
    render(<MyContestationCard contestation={FOUNDED_RESTITUTION} outcomeShownAbove />);
    expect(screen.queryByText(OUTCOME)).not.toBeInTheDocument();
    // La décision et la réponse de l'IT restent affichées.
    expect(screen.getByText(/Fondée le 27 septembre 2026/)).toBeInTheDocument();
    expect(screen.getByText('Vous avez raison.')).toBeInTheDocument();
  });
});
