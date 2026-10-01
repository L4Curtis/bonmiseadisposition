import { describe, expect, it } from 'vitest';
import { parseErrorBody, toListResponse } from '../api-envelope';

describe('parseErrorBody — erreur unique { statusCode, code, message, details? }', () => {
  it('forme unique : code, message et détails', () => {
    expect(
      parseErrorBody({
        statusCode: 409,
        code: 'serial_conflicts',
        message: 'Numéros déjà prêtés.',
        details: { conflicts: [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }] },
      }),
    ).toEqual({
      code: 'serial_conflicts',
      message: 'Numéros déjà prêtés.',
      details: { conflicts: [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }] },
    });
  });

  it('validation : message déjà joint par le serveur, champs dans details.errors', () => {
    const parsed = parseErrorBody({
      statusCode: 400,
      code: 'validation_failed',
      message: 'page doit être un entier — limit doit valoir 25, 50, 100',
      details: { errors: [{ field: 'page', messages: ['page doit être un entier'] }] },
    });
    expect(parsed.message).toBe('page doit être un entier — limit doit valoir 25, 50, 100');
    expect(parsed.details).toEqual({ errors: [{ field: 'page', messages: ['page doit être un entier'] }] });
  });

  it('ancienne forme NestJS : message en tableau joint par « — », pas de code', () => {
    expect(parseErrorBody({ statusCode: 400, message: ['champ A invalide', 'champ B invalide'], error: 'Bad Request' })).toEqual({
      code: null,
      message: 'champ A invalide — champ B invalide',
      details: null,
    });
  });

  it('ancienne forme à code sans message (409 { code, sentAt }) : données reprises dans details', () => {
    expect(parseErrorBody({ code: 'token_recent', sentAt: '2026-10-01T08:00:00.000Z' })).toEqual({
      code: 'token_recent',
      message: null,
      details: { sentAt: '2026-10-01T08:00:00.000Z' },
    });
  });

  it('ancienne réponse CSRF { message } : message seul', () => {
    expect(parseErrorBody({ message: 'CSRF protection: header X-Requested-With manquant' })).toEqual({
      code: null,
      message: 'CSRF protection: header X-Requested-With manquant',
      details: null,
    });
  });

  it('corps inattendu : rien d’exploitable', () => {
    expect(parseErrorBody(null)).toEqual({ code: null, message: null, details: null });
    expect(parseErrorBody('texte')).toEqual({ code: null, message: null, details: null });
    expect(parseErrorBody({ code: 42, message: '' })).toEqual({ code: null, message: null, details: null });
  });
});

describe('toListResponse — liste unique { items, total, page, limit, truncated, meta? }', () => {
  it('forme unique : reprise telle quelle', () => {
    const list = { items: [{ id: 1 }], total: 40, page: 2, limit: 25, truncated: false, meta: { openCount: 3 } };
    expect(toListResponse(list)).toEqual(list);
  });

  it('forme unique sans meta : pas de clé meta ajoutée', () => {
    expect(toListResponse({ items: [], total: 0, page: 1, limit: 25, truncated: false })).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
      truncated: false,
    });
  });

  it('ancienne liste à clé propre ({ bons, total, page, limit }) : clé donnée en option, le reste en meta', () => {
    expect(toListResponse({ contestations: ['c'], total: 1, page: 1, limit: 20, openCount: 4 }, { legacyKey: 'contestations' })).toEqual({
      items: ['c'],
      total: 1,
      page: 1,
      limit: 20,
      truncated: false,
      meta: { openCount: 4 },
    });
  });

  it('ancienne liste partielle ({ items, truncated, total }) : page 1, limit = nombre d’éléments', () => {
    expect(toListResponse({ items: ['a', 'b'], truncated: true, total: 300 })).toEqual({
      items: ['a', 'b'],
      total: 300,
      page: 1,
      limit: 2,
      truncated: true,
    });
  });

  it('ancien tableau nu (référentiel) : liste complète d’une page', () => {
    expect(toListResponse(['x', 'y'])).toEqual({ items: ['x', 'y'], total: 2, page: 1, limit: 2, truncated: false });
  });

  it('réponse qui n’est pas une liste : erreur explicite plutôt qu’un écran vide', () => {
    expect(() => toListResponse({ bons: [] })).toThrow('liste');
    expect(() => toListResponse(null)).toThrow('liste');
  });
});
