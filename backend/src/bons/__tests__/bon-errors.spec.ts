import { ConflictException } from '@nestjs/common';
import { buildErrorResponse } from '../../common/errors';
import {
  bonNotFoundError,
  missingSerialsError,
  serialConflictsError,
  tokenRecentError,
  tokenRecentSentAt,
} from '../bon-errors';

const REQUEST = { method: 'POST', url: '/api/bons/b1/send' };

describe('Erreurs propres aux bons — forme unique, données dans details', () => {
  it('serial_conflicts : 409, message français, numéros dans details et nulle part ailleurs', () => {
    const conflicts = [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }];
    const { status, body } = buildErrorResponse(serialConflictsError(conflicts), REQUEST);
    expect(status).toBe(409);
    expect(body).toEqual({
      statusCode: 409,
      code: 'serial_conflicts',
      message: 'Un numéro de série de ce bon est déjà prêté sur un autre bon en cours.',
      details: { conflicts },
    });
  });

  it('serial_conflicts : le message compte les numéros quand il y en a plusieurs', () => {
    const conflicts = [
      { serialNumber: 'SN-1', bonReference: 'BON-2026-0001' },
      { serialNumber: 'SN-2', bonReference: 'BON-2026-0002' },
    ];
    expect(buildErrorResponse(serialConflictsError(conflicts), REQUEST).body.message).toBe(
      '2 numéros de série de ce bon sont déjà prêtés sur un autre bon en cours.',
    );
  });

  it('missing_serials : 409, lignes dans details', () => {
    const lines = [{ equipmentId: 'e1', position: 1, label: 'Dell Latitude' }];
    const { status, body } = buildErrorResponse(missingSerialsError(lines), REQUEST);
    expect(status).toBe(409);
    expect(body).toEqual({
      statusCode: 409,
      code: 'missing_serials',
      message: 'Un équipement de ce bon n’a ni numéro de série ni numéro d’inventaire.',
      details: { lines },
    });
  });

  it('token_recent : 409, date d’envoi en ISO dans details', () => {
    const sentAt = new Date('2026-10-01T08:00:00.000Z');
    const { body } = buildErrorResponse(tokenRecentError(sentAt), REQUEST);
    expect(body).toEqual({
      statusCode: 409,
      code: 'token_recent',
      message: 'Un lien a été envoyé il y a moins d’une heure.',
      details: { sentAt: '2026-10-01T08:00:00.000Z' },
    });
  });

  it('not_found : 404 « Bon introuvable »', () => {
    const { status, body } = buildErrorResponse(bonNotFoundError(), REQUEST);
    expect(status).toBe(404);
    expect(body).toEqual({ statusCode: 404, code: 'not_found', message: 'Bon introuvable' });
  });

  it('tokenRecentSentAt lit la date d’une erreur token_recent, et rien d’une autre erreur', () => {
    expect(tokenRecentSentAt(tokenRecentError(new Date('2026-10-01T08:00:00.000Z')))).toBe('2026-10-01T08:00:00.000Z');
    expect(tokenRecentSentAt(serialConflictsError([]))).toBeNull();
    expect(tokenRecentSentAt(new ConflictException({ code: 'token_recent', sentAt: 'x' }))).toBeNull();
    expect(tokenRecentSentAt(new Error('autre'))).toBeNull();
  });
});
