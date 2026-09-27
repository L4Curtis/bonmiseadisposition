import { describe, expect, it } from 'vitest';
import type { PortalBon, PortalSignature } from '@/contracts/bons';
import { classifyPortal } from '../portal-classification';

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function sig(extra: Partial<PortalSignature>): PortalSignature {
  return {
    id: `s-${Math.random()}`,
    type: 'mise_disposition',
    signed: true,
    signedAt: '2026-07-01T10:00:00Z',
    signerEmail: 'lea@example.test',
    mentionLuApprouve: true,
    isInPerson: false,
    tokenExpiresAt: PAST,
    createdAt: '2026-07-01T09:00:00Z',
    pdfType: null,
    ...extra,
  };
}

function equipment(extra: Partial<PortalBon['equipments'][number]> = {}): PortalBon['equipments'][number] {
  return {
    id: `e-${Math.random()}`,
    bonId: 'b',
    catalogItemId: 'c',
    customLabel: null,
    serialNumber: 'SN-1',
    inventoryNumber: null,
    notes: null,
    order: 0,
    returnedAt: null,
    notReturned: false,
    notReturnedReason: null,
    createdAt: '2026-07-01T09:00:00Z',
    catalogItem: { id: 'c', brand: 'Apple', model: 'MacBook Air', category: 'pc_portable' },
    ...extra,
  };
}

function bon(extra: Partial<PortalBon>): PortalBon {
  return {
    id: extra.reference ?? 'b',
    reference: 'BON-2026-0001',
    status: 'active',
    dateMiseDisposition: '2026-07-01T00:00:00Z',
    equipments: [],
    signatures: [],
    ...extra,
  } as PortalBon;
}

describe('classifyPortal — ce que la personne doit faire (R-057)', () => {
  it('Léa : S03 remise à signer (lien expiré) et S08 PV à signer (expiré) dans « À signer », S06 dans « En cours »', () => {
    const s03 = bon({ reference: 'S03', status: 'sent_mise_dispo', signatures: [sig({ signed: false, tokenExpiresAt: PAST })] });
    const s08 = bon({
      reference: 'S08',
      status: 'partially_returned',
      equipments: [equipment({ notReturned: true })],
      signatures: [sig({}), sig({ type: 'pv_cloture', signed: false, tokenExpiresAt: PAST, createdAt: '2026-09-01T00:00:00Z' })],
    });
    const s06 = bon({
      reference: 'S06',
      status: 'partially_returned',
      equipments: [equipment({ returnedAt: '2026-09-01T00:00:00Z' }), equipment({ id: 'e-held' })],
      signatures: [sig({}), sig({ type: 'restitution', createdAt: '2026-09-02T00:00:00Z' })],
    });
    const groups = classifyPortal([s03, s08, s06]);
    expect(groups.toSign.map((d) => [d.bon.reference, d.type, d.expired])).toEqual([
      ['S03', 'mise_disposition', true],
      ['S08', 'pv_cloture', true],
    ]);
    expect(groups.current.map((b) => b.reference)).toEqual(['S06']);
    expect(groups.history).toEqual([]);
  });

  it('lien valide : le jeton est proposé ; lien au guichet : pas de jeton, « au guichet »', () => {
    const remote = bon({ status: 'sent_restitution', signatures: [sig({ type: 'restitution', signed: false, token: 'tok', tokenExpiresAt: FUTURE })] });
    const counter = bon({ status: 'sent_mise_dispo', signatures: [sig({ signed: false, isInPerson: true, inPersonPending: true, tokenExpiresAt: FUTURE })] });
    const [a, b] = classifyPortal([remote, counter]).toSign;
    expect(a).toMatchObject({ token: 'tok', expired: false, inPerson: false });
    expect(b).toMatchObject({ token: null, expired: false, inPerson: true });
  });

  it('le calcul du serveur (pendingSignature) l’emporte', () => {
    const b = bon({
      status: 'partially_returned',
      pendingSignature: { type: 'restitution', expired: true, inPerson: false, itSigned: true, sentAt: null, expiresAt: null },
    });
    expect(classifyPortal([b]).toSign[0]).toMatchObject({ type: 'restitution', expired: true });
    const nothing = bon({ status: 'partially_returned', pendingSignature: null, equipments: [equipment()] });
    expect(classifyPortal([nothing]).current).toHaveLength(1);
  });

  it('un vieux lien remplacé puis signé ne remet pas le bon dans « À signer »', () => {
    const b = bon({
      status: 'partially_returned',
      signatures: [
        sig({ type: 'restitution', signed: false, tokenExpiresAt: new Date(0).toISOString(), createdAt: '2026-08-01T00:00:00Z' }),
        sig({ type: 'restitution', signed: true, createdAt: '2026-08-02T00:00:00Z' }),
      ],
      equipments: [equipment()],
    });
    const groups = classifyPortal([b]);
    expect(groups.toSign).toEqual([]);
    expect(groups.current).toHaveLength(1);
  });

  it('contesté : ni « À signer » ni « En cours » ; clôturé : « Historique »', () => {
    const groups = classifyPortal([
      bon({ reference: 'C', status: 'contested', signatures: [sig({ type: 'restitution', signed: false, tokenExpiresAt: FUTURE })] }),
      bon({ reference: 'H', status: 'archived' }),
    ]);
    expect(groups.contested.map((b) => b.reference)).toEqual(['C']);
    expect(groups.history.map((b) => b.reference)).toEqual(['H']);
    expect(groups.toSign).toEqual([]);
  });

  it('« Mes équipements » : seulement ce qui est encore chez la personne, avec n° de série et catégorie', () => {
    const groups = classifyPortal([
      bon({
        reference: 'A',
        status: 'partially_returned',
        equipments: [
          equipment({ id: 'rendu', returnedAt: '2026-09-01T00:00:00Z' }),
          equipment({ id: 'perdu', notReturned: true }),
          equipment({ id: 'chez-elle', serialNumber: 'SN-42', order: 1 }),
          equipment({ id: 'etat-serveur', returnState: 'returned_to_sign' }),
        ],
      }),
      bon({ reference: 'B', status: 'archived', equipments: [equipment({ id: 'clos' })] }),
    ]);
    expect(groups.held.map((h) => h.id)).toEqual(['chez-elle']);
    expect(groups.held[0]).toMatchObject({
      serialNumber: 'SN-42',
      category: 'pc_portable',
      label: 'Apple MacBook Air',
      awaitingSignature: false,
      signToken: null,
    });
  });

  it('« Chez vous » liste aussi le matériel d’une remise à signer, marqué « à signer », avec son lien', () => {
    const groups = classifyPortal([
      bon({
        reference: 'D',
        status: 'sent_mise_dispo',
        equipments: [equipment({ id: 'recu-non-signe', serialNumber: 'SN-7' })],
        signatures: [sig({ signed: false, token: 'tok-remise', tokenExpiresAt: FUTURE })],
      }),
      bon({
        reference: 'E',
        status: 'sent_mise_dispo',
        equipments: [equipment({ id: 'lien-expire' })],
        // Lien expiré : le serveur ne transmet plus le jeton.
        signatures: [sig({ signed: false, tokenExpiresAt: PAST })],
      }),
    ]);
    expect(groups.held.map((h) => [h.id, h.awaitingSignature, h.signToken])).toEqual([
      ['recu-non-signe', true, 'tok-remise'],
      ['lien-expire', true, null],
    ]);
  });

  it('une remise à signer au guichet : « à signer », sans lien', () => {
    const groups = classifyPortal([
      bon({
        status: 'sent_mise_dispo',
        equipments: [equipment({ id: 'guichet' })],
        signatures: [sig({ signed: false, isInPerson: true, inPersonPending: true, token: 'tok-guichet', tokenExpiresAt: FUTURE })],
      }),
    ]);
    expect(groups.held[0]).toMatchObject({ id: 'guichet', awaitingSignature: true, signToken: null });
  });

  it('« Signer la remise » jamais sur un lien expiré, même quand le serveur transmet son jeton', () => {
    // Le serveur garde le jeton du dernier lien expiré (pour « Demander un
    // nouveau lien ») : ce jeton ne doit pas devenir un bouton « Signer ».
    const expiredWithToken = sig({ signed: false, token: 'tok-expire', tokenExpiresAt: PAST });
    const withoutServerState = bon({
      reference: 'F',
      status: 'sent_mise_dispo',
      equipments: [equipment({ id: 'sans-etat-serveur' })],
      signatures: [expiredWithToken],
    });
    const withServerState = bon({
      reference: 'G',
      status: 'sent_mise_dispo',
      equipments: [equipment({ id: 'avec-etat-serveur' })],
      signatures: [expiredWithToken],
      pendingSignature: { type: 'mise_disposition', expired: true, inPerson: false, itSigned: true, sentAt: null, expiresAt: null },
    });
    const groups = classifyPortal([withoutServerState, withServerState]);
    expect(groups.held.map((h) => [h.id, h.signToken])).toEqual([
      ['sans-etat-serveur', null],
      ['avec-etat-serveur', null],
    ]);
    expect(groups.toSign.map((d) => [d.bon.reference, d.token, d.expired, d.requestToken])).toEqual([
      ['F', null, true, 'tok-expire'],
      ['G', null, true, 'tok-expire'],
    ]);
  });

  it('bon remplacé (contestation « Fondée ») : chaque équipement n’apparaît qu’une fois dans « Chez vous »', () => {
    // L'original reste « En cours » tant que le remplaçant, qui reprend les
    // mêmes équipements, attend la signature de sa remise.
    const original = bon({
      id: 'orig',
      reference: 'ORIG',
      status: 'active',
      equipments: [equipment({ id: 'orig-pc', serialNumber: 'SN-PC' })],
      signatures: [sig({})],
      replacedBy: { id: 'rempl', reference: 'REMPL' },
    });
    const replacement = bon({
      id: 'rempl',
      reference: 'REMPL',
      status: 'sent_mise_dispo',
      equipments: [equipment({ id: 'rempl-pc', serialNumber: 'SN-PC' })],
      signatures: [sig({ signed: false, token: 'tok-rempl', tokenExpiresAt: FUTURE })],
      replaces: { id: 'orig', reference: 'ORIG' },
    });
    const groups = classifyPortal([replacement, original]);
    expect(groups.held.map((h) => [h.id, h.bon.reference, h.signToken])).toEqual([['rempl-pc', 'REMPL', 'tok-rempl']]);
  });

  it('remplaçant encore en préparation (absent du portail) : l’original garde ses équipements', () => {
    const original = bon({
      id: 'orig',
      status: 'active',
      equipments: [equipment({ id: 'orig-pc' })],
      replacedBy: { id: 'brouillon', reference: 'BROUILLON' },
    });
    expect(classifyPortal([original]).held.map((h) => h.id)).toEqual(['orig-pc']);
  });

  it('restitution contestée puis « Fondée » : document en cours de correction, pas un lien expiré (CM n° 1)', () => {
    const invalidated = sig({
      type: 'restitution',
      signed: false,
      tokenExpiresAt: new Date(0).toISOString(),
      invalidatedAt: '2026-09-27T10:00:00Z',
      invalidatedReason: 'contested',
      createdAt: '2026-09-20T00:00:00Z',
    });
    const s25 = bon({
      reference: 'S25',
      status: 'sent_restitution',
      equipments: [
        equipment({ id: 'pc', returnState: 'returned_to_sign' }),
        equipment({ id: 'casque', returnState: 'returned_to_sign', order: 1 }),
      ],
      signatures: [sig({}), invalidated],
      pendingSignature: { type: 'restitution', expired: true, inPerson: false, itSigned: false, sentAt: null, expiresAt: null },
    });
    const groups = classifyPortal([s25]);
    expect(groups.toSign).toEqual([]);
    expect(groups.inCorrection[0]).toMatchObject({ type: 'restitution', expired: true, invalidatedReason: 'contested', underCorrection: true });
    // Le marquage « rendu » est contesté : tant qu'il n'est pas corrigé et signé,
    // le matériel reste listé chez la personne.
    expect(groups.held.map((h) => [h.id, h.underCorrection])).toEqual([
      ['pc', true],
      ['casque', true],
    ]);
  });

  it('PV contesté puis « Fondée » : le matériel déclaré non restitué reste listé, en cours de correction', () => {
    const y = bon({
      reference: 'Y',
      status: 'partially_returned',
      equipments: [equipment({ id: 'rendu', returnState: 'returned' }), equipment({ id: 'perdu', returnState: 'not_returned', order: 1 })],
      signatures: [
        sig({}),
        sig({ type: 'pv_cloture', signed: false, tokenExpiresAt: new Date(0).toISOString(), invalidatedReason: 'contested' }),
      ],
      pendingSignature: { type: 'pv_cloture', expired: true, inPerson: false, itSigned: true, sentAt: null, expiresAt: null },
    });
    const groups = classifyPortal([y]);
    expect(groups.toSign).toEqual([]);
    expect(groups.inCorrection[0]).toMatchObject({ type: 'pv_cloture', underCorrection: true });
    expect(groups.held.map((h) => [h.id, h.underCorrection])).toEqual([['perdu', true]]);
  });

  it('bon modifié : le vrai motif (« modified »), pas un lien expiré (R-038)', () => {
    const s23 = bon({
      reference: 'S23',
      status: 'sent_mise_dispo',
      signatures: [sig({ signed: false, tokenExpiresAt: new Date(0).toISOString(), invalidatedReason: 'modified' })],
      pendingSignature: { type: 'mise_disposition', expired: true, inPerson: false, itSigned: false, sentAt: null, expiresAt: null },
    });
    expect(classifyPortal([s23]).toSign[0]).toMatchObject({ invalidatedReason: 'modified', underCorrection: false, requestToken: null });
  });

  it('lien expiré déjà redemandé : la date de la demande, transmise par le serveur', () => {
    // `newLinkRequestedAt` : champ attendu du contrat `PendingSignature` (lot R1).
    const pending = {
      type: 'mise_disposition' as const,
      expired: true,
      inPerson: false,
      itSigned: true,
      sentAt: null,
      expiresAt: null,
      newLinkRequestedAt: '2026-09-27T09:30:00Z',
    };
    const s03 = bon({
      reference: 'S03',
      status: 'sent_mise_dispo',
      signatures: [sig({ signed: false, token: 'tok-expire', tokenExpiresAt: PAST })],
      pendingSignature: pending,
    });
    expect(classifyPortal([s03]).toSign[0]).toMatchObject({
      invalidatedReason: null,
      newLinkRequestedAt: '2026-09-27T09:30:00Z',
      requestToken: 'tok-expire',
    });
  });
});
