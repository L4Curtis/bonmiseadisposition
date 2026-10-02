import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BonNotificationLogs } from '../BonNotificationLogs';

const FAILURE = "Adresse refusée par le serveur de messagerie : corrigez l'adresse du compte.";

describe('BonNotificationLogs — historique des emails', () => {
  it('passe à la ligne entre les mots, sans couper un mot au milieu (téléphone 375 px)', () => {
    render(
      <BonNotificationLogs
        logs={[{
          id: 'n-1', type: 'signature_request', status: 'failed', recipientEmail: 'julie@livio.fr',
          errorMessage: FAILURE, sentAt: '2026-10-01T08:42:00.000Z',
        }]}
      />,
    );
    const message = screen.getByText(FAILURE);
    // break-all coupait « l'a / dresse » ; break-words ne coupe qu'un mot plus
    // large que la colonne (une adresse très longue).
    expect(message).not.toHaveClass('break-all');
    expect(message).toHaveClass('break-words');
  });
});
