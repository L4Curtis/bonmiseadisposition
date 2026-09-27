/**
 * Outils des tests de cycle de vie (bon-lifecycle.contract.ts,
 * bon-send.contract.ts) : un bon prêt dans l'état voulu, écrit directement
 * en base comme le ferait le parcours, et quelques lectures.
 */
import { BonStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { ContractContext } from '../support/context';
import type { SeededPerson } from '../support/seed';

/** Plus petit PNG valide (1 × 1 pixel transparent), en data URL. */
export const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let counter = 0;

export interface LifecycleBon {
  id: string;
  equipmentIds: string[];
}

/** Bon « En cours » (remise signée il y a un mois) de `count` équipements. */
export async function createActiveBon(
  ctx: ContractContext,
  collaborateur: SeededPerson,
  count: number,
  status: BonStatus = 'active',
): Promise<LifecycleBon> {
  counter += 1;
  const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bon = await ctx.prisma.bon.create({
    data: {
      // Numéros sous ceux du jeu de données : jamais ceux que l’API attribue ensuite (maximum + 1).
      reference: `BON-2026-${String(8000 + counter)}`,
      filialeId: ctx.data.filialeId,
      collaborateurId: collaborateur.id,
      collaborateurEmail: collaborateur.email,
      createdById: ctx.data.people.technician.id,
      civilite: 'mme',
      status,
      dateMiseDisposition: month,
      equipments: {
        create: Array.from({ length: count }, (_, order) => ({
          catalogItemId: ctx.data.catalog.laptopId,
          serialNumber: `SN-CYCLE-${counter}-${order}`,
          order,
        })),
      },
      signatures: {
        create: [
          {
            type: 'it_cachet', token: randomUUID(), tokenExpiresAt: month, signed: true, signedAt: month,
            signerEmail: ctx.data.people.technician.email, pdfType: 'mise_disposition',
          },
          {
            type: 'mise_disposition', token: randomUUID(), tokenExpiresAt: month, signed: true, signedAt: month,
            signerEmail: collaborateur.email ?? ctx.data.people.technician.email, mentionLuApprouve: true,
          },
        ],
      },
    },
    include: { equipments: { orderBy: { order: 'asc' } } },
  });
  return { id: bon.id, equipmentIds: bon.equipments.map((e) => e.id) };
}

/** Fiche vue par l'IT. */
export async function itDetail(ctx: ContractContext, bonId: string) {
  const res = await ctx.http.get(`/bons/${bonId}`, 'technician');
  expect(res.status).toBe(200);
  return res.body;
}

/** Pose la signature IT d'un document. */
export async function signIt(ctx: ContractContext, bonId: string, pdfType: 'mise_disposition' | 'restitution') {
  const res = await ctx.http.post(`/bons/${bonId}/sign-it`, 'technician', { signatureDataUrl: SIGNATURE_PNG, pdfType });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

/** Le collaborateur (ou le technicien, au guichet) signe par le lien. */
export async function signLink(ctx: ContractContext, token: string, caller: 'collaborator' | 'technician') {
  return ctx.http.post(`/signature/${token}/sign`, caller, { signatureDataUrl: SIGNATURE_PNG, mentionLuApprouve: true });
}

/** Dernier lien non signé (hors signature IT) d'un bon. */
export async function latestLink(ctx: ContractContext, bonId: string) {
  return ctx.prisma.signature.findFirstOrThrow({
    where: { bonId, signed: false, type: { not: 'it_cachet' } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Actions proposées par la fiche (nom seulement). */
export function actionNames(detail: { availableActions?: { action: string }[] }): string[] {
  return (detail.availableActions ?? []).map((a) => a.action);
}
