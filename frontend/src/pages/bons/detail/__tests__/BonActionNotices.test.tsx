import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HandleContestationButton } from '../BonActionNotices';

describe('« Traiter la contestation »', () => {
  it('ouvre directement la décision de cette contestation', () => {
    render(<MemoryRouter><HandleContestationButton contestationId="c-42" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Traiter la contestation/ })).toHaveAttribute(
      'href', '/admin/contestations?contestation=c-42',
    );
  });
});
