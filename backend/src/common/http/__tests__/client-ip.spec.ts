import type { AddressInfo } from 'net';
import type { Server } from 'http';
import express, { type Request } from 'express';
import { TRUSTED_PROXY_HOPS, clientIp } from '../client-ip';

/**
 * Règle testée à travers un vrai serveur Express, réglé comme la production
 * (`trust proxy` = TRUSTED_PROXY_HOPS). La route renvoie l'adresse retenue
 * par clientIp et celle que voit le limiteur de débit (`req.ip`) : les deux
 * doivent toujours coïncider.
 */
async function whoAmI(headers: Record<string, string> = {}): Promise<{ clientIp: string; limiterIp: string }> {
  const app = express();
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
  app.get('/ip', (req: Request, res) => {
    res.json({ clientIp: clientIp(req), limiterIp: req.ip });
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/ip`, { headers });
    return (await response.json()) as { clientIp: string; limiterIp: string };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const LOOPBACK = /^(::ffff:)?127\.0\.0\.1$/;

describe('clientIp', () => {
  it('derrière nginx : l’adresse transmise par le proxy (X-Forwarded-For)', async () => {
    const result = await whoAmI({ 'X-Forwarded-For': '203.0.113.7' });

    expect(result).toEqual({ clientIp: '203.0.113.7', limiterIp: '203.0.113.7' });
  });

  it('ignore une adresse ajoutée en tête par le client lui-même', async () => {
    const result = await whoAmI({ 'X-Forwarded-For': '6.6.6.6, 203.0.113.7' });

    expect(result.clientIp).toBe('203.0.113.7');
    expect(result.clientIp).toBe(result.limiterIp);
  });

  it('ne croit pas un X-Real-IP envoyé directement au backend', async () => {
    const result = await whoAmI({ 'X-Real-IP': '198.51.100.9' });

    expect(result.clientIp).toMatch(LOOPBACK);
    expect(result.clientIp).toBe(result.limiterIp);
  });

  it('sans proxy : l’adresse de la connexion', async () => {
    const result = await whoAmI();

    expect(result.clientIp).toMatch(LOOPBACK);
    expect(result.clientIp).toBe(result.limiterIp);
  });

  it('se replie sur l’adresse du socket, puis sur « unknown »', () => {
    expect(clientIp({ ip: undefined, socket: { remoteAddress: '10.0.0.1' } })).toBe('10.0.0.1');
    expect(clientIp({ ip: undefined, socket: { remoteAddress: undefined } })).toBe('unknown');
  });
});
