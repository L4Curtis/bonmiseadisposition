import type { Request } from 'express';
import { SignatureController } from '../signature.controller';
import type { SignatureService } from '../signature.service';
import type { AuthUser } from '../../auth/auth-user.interface';

/**
 * Adresse enregistrée sur une signature : la règle unique `clientIp`
 * (`req.ip`, calculée par Express derrière le proxy de confiance), jamais un
 * en-tête X-Real-IP que le poste aurait posé lui-même.
 */
describe('SignatureController.sign — adresse du signataire', () => {
  const signedResult = {
    signature: { bonId: 'bon-1', signedByProxy: false, witnessedByIt: false },
    bon: { id: 'bon-1' },
  };
  const user = { id: 'u-1', email: 'collab@example.com', role: 'collaborator' } as AuthUser;

  function setup() {
    const sign = vi.fn().mockResolvedValue(signedResult);
    const controller = new SignatureController({ sign } as unknown as SignatureService);
    return { controller, sign };
  }

  it('enregistre req.ip et ignore un X-Real-IP envoyé par le client', async () => {
    const { controller, sign } = setup();
    const req = {
      ip: '203.0.113.7',
      headers: { 'x-real-ip': '6.6.6.6', 'user-agent': 'navigateur' },
      socket: { remoteAddress: '10.0.0.2' },
    } as unknown as Request;

    await controller.sign('jeton', { signatureDataUrl: 'data:image/png;base64,AA', mentionLuApprouve: true }, user, req);

    expect(sign).toHaveBeenCalledWith('jeton', expect.objectContaining({ signerIp: '203.0.113.7', signerUserAgent: 'navigateur' }));
  });

  it('sans adresse calculée : celle de la connexion', async () => {
    const { controller, sign } = setup();
    const req = { headers: {}, socket: { remoteAddress: '10.0.0.2' } } as unknown as Request;

    await controller.sign('jeton', { signatureDataUrl: 'data:image/png;base64,AA', mentionLuApprouve: true }, user, req);

    expect(sign).toHaveBeenCalledWith('jeton', expect.objectContaining({ signerIp: '10.0.0.2', signerUserAgent: 'unknown' }));
  });
});
