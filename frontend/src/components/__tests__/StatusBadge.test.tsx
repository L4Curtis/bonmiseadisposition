import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';
import { BON_STATUS_LABELS } from '@/types';

describe('StatusBadge', () => {
  it('renders the human label for a status', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText(BON_STATUS_LABELS['active'])).toBeInTheDocument();
  });

  it('shows the pending-signature badge for partially_returned with an unsigned restitution', () => {
    render(<StatusBadge status="partially_returned" signatures={[{ type: 'restitution', signed: false }]} />);
    expect(screen.getByText('En attente de signature')).toBeInTheDocument();
  });

  it('does NOT show the pending-signature badge when the restitution is signed', () => {
    render(<StatusBadge status="partially_returned" signatures={[{ type: 'restitution', signed: true }]} />);
    // Seul le libellé de statut « Restitution partielle » est présent
    expect(screen.getByText(BON_STATUS_LABELS['partially_returned'])).toBeInTheDocument();
    expect(screen.queryByText('En attente de signature')).not.toBeInTheDocument();
  });
});
