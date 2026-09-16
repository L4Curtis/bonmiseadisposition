import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../api';

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { toast } from '@/hooks/use-toast';
import { errorMessage, showActionError } from '../errors';

describe('errorMessage', () => {
  it('always returns the fixed rate-limit message for a 429 ApiError, ignoring its own message', async () => {
    const err = new ApiError(429, 'ce message ne doit jamais être affiché');
    expect(errorMessage(err, 'fallback')).toBe('Trop de requêtes, réessayez dans une minute.');
  });

  it('returns the ApiError message for any other status', () => {
    const err = new ApiError(400, 'Champ invalide');
    expect(errorMessage(err, 'fallback')).toBe('Champ invalide');
  });

  it('falls back when the ApiError carries no message', () => {
    const err = new ApiError(500, '');
    expect(errorMessage(err, 'fallback')).toBe('fallback');
  });

  it('returns the message of a plain Error', () => {
    expect(errorMessage(new Error('Erreur réseau'), 'fallback')).toBe('Erreur réseau');
  });

  it('falls back for a non-Error, non-ApiError thrown value', () => {
    expect(errorMessage('boom', 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    expect(errorMessage({ some: 'object' }, 'fallback')).toBe('fallback');
  });
});

describe('showActionError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a destructive toast with the resolved error message', () => {
    showActionError(new ApiError(403, 'Accès refusé'), 'Erreur générique');
    expect(toast).toHaveBeenCalledWith({
      title: 'Erreur',
      description: 'Accès refusé',
      variant: 'destructive',
    });
  });

  it('falls back to the provided message for an unknown error shape', () => {
    showActionError('oops', 'Erreur générique');
    expect(toast).toHaveBeenCalledWith({
      title: 'Erreur',
      description: 'Erreur générique',
      variant: 'destructive',
    });
  });
});
