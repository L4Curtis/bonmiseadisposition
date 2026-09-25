import type { AddressInfo } from 'net';
import type { Server } from 'http';
import express, { type Response } from 'express';
import { buildCsv } from '../csv';
import { csvFilename, sendCsv, type SendCsvOptions } from '../send-csv';

/**
 * sendCsv est testé à travers un vrai serveur Express et une vraie requête
 * HTTP : on vérifie les en-têtes et les octets réellement reçus par le
 * navigateur, pas des appels simulés.
 */
async function download(options: SendCsvOptions) {
  const app = express();
  app.get('/export', (_req, res: Response) => sendCsv(res, options));
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/export`);
    // arrayBuffer et non text() : le décodage UTF-8 de fetch retire le BOM.
    const bytes = Buffer.from(await response.arrayBuffer());
    return { response, bytes };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const TABLE = { header: ['Référence', 'Statut'], rows: [['BON-2026-0001', 'En cours']] };

describe('sendCsv', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('envoie le fichier en pièce jointe, BOM compris', async () => {
    const { response, bytes } = await download({ filename: 'bons-export', rows: TABLE });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString('utf8')).toBe(buildCsv(TABLE));
  });

  it('date le nom du fichier à la date de Paris, même entre 0 h et 2 h', async () => {
    // 22 h 30 UTC le 14 juillet = 0 h 30 le 15 juillet à Paris.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-14T22:30:00.000Z'));

    const { response } = await download({ filename: 'inventaire', rows: TABLE });

    expect(response.headers.get('content-disposition')).toBe('attachment; filename="inventaire-2026-07-15.csv"');
  });

  it('signale la troncature par X-Truncated, lisible par le navigateur', async () => {
    const { response } = await download({ filename: 'journal-audit', rows: TABLE, truncated: true });

    expect(response.headers.get('x-truncated')).toBe('true');
    const exposed = (response.headers.get('access-control-expose-headers') ?? '').split(/,\s*/);
    expect(exposed).toEqual(expect.arrayContaining(['Content-Disposition', 'X-Truncated']));
  });

  it('sans troncature : pas d’en-tête X-Truncated', async () => {
    const { response } = await download({ filename: 'bons-export', rows: TABLE, truncated: false });

    expect(response.headers.get('x-truncated')).toBeNull();
  });

  it('accepte un fichier déjà assemblé par buildCsv', async () => {
    const csv = buildCsv(TABLE);
    const { bytes } = await download({ filename: 'bons-export', csv });

    expect(bytes.toString('utf8')).toBe(csv);
  });

  it('un modèle d’import garde son nom fixe, sans date', async () => {
    const { response } = await download({ filename: 'modele-import-filiales', rows: TABLE, dated: false });

    expect(response.headers.get('content-disposition')).toBe('attachment; filename="modele-import-filiales.csv"');
  });
});

describe('csvFilename', () => {
  it('ajoute la date de Paris et l’extension', () => {
    expect(csvFilename('bons-export', { now: new Date('2026-01-14T23:30:00.000Z') })).toBe('bons-export-2026-01-15.csv');
  });

  it('neutralise les caractères qui casseraient l’en-tête Content-Disposition', () => {
    expect(csvFilename('ex"port\r\nX-Injecté: 1', { dated: false })).toBe('ex-port--X-Inject---1.csv');
  });

  it('un nom vide devient « export »', () => {
    expect(csvFilename('', { dated: false })).toBe('export.csv');
  });
});
