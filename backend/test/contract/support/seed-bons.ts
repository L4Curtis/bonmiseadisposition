/**
 * Bons du jeu de données de contrat : un bon par statut, avec les signatures,
 * équipements et documents qu'un vrai bon aurait à ce stade (cachet IT signé
 * avant l'envoi, lien en attente, restitution partielle…).
 */
import { BonStatus, PrismaClient, SignatureType } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  BonFixtureKey,
  CONTRACT_YEAR,
  DUPLICATE_SERIAL,
  INVENTORY_NUMBER,
  PENDING_REMISE_TOKEN,
  PENDING_RESTITUTION_TOKEN,
  SIGNED_TOKEN,
} from './fixtures';
import type { SeededCatalog, SeededPeople, SeededPerson } from './seed';

export interface SeededBon {
  id: string;
  reference: string;
  equipmentIds: readonly string[];
}

export type SeededBons = Readonly<Record<BonFixtureKey, SeededBon>>;

interface EquipmentSpec {
  catalogItemId: string | null;
  customLabel?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  returned?: boolean;
}

interface SignatureSpec {
  type: SignatureType;
  signed: boolean;
  token?: string;
  pdfType?: 'mise_disposition' | 'restitution';
}

interface BonSpec {
  key: BonFixtureKey;
  status: BonStatus;
  collaborateur: SeededPerson;
  equipments: readonly EquipmentSpec[];
  signatures: readonly SignatureSpec[];
  dateRestitutionDaysFromNow?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

function signatureData(spec: SignatureSpec, signer: SeededPerson, itSigner: SeededPerson) {
  const isIt = spec.type === 'it_cachet';
  return {
    type: spec.type,
    token: spec.token ?? randomUUID(),
    tokenExpiresAt: daysFromNow(spec.signed ? -20 : 7),
    signed: spec.signed,
    signedAt: spec.signed ? daysFromNow(-21) : null,
    signerEmail: spec.signed ? (isIt ? itSigner.email : signer.email) : null,
    mentionLuApprouve: spec.signed && !isIt,
    pdfType: spec.pdfType ?? null,
    initiatedById: itSigner.id,
  };
}

function bonSpecs(people: SeededPeople, catalog: SeededCatalog): readonly BonSpec[] {
  const laptop = (extra: Partial<EquipmentSpec> = {}): EquipmentSpec => ({ catalogItemId: catalog.laptopId, ...extra });
  const screen = (extra: Partial<EquipmentSpec> = {}): EquipmentSpec => ({ catalogItemId: catalog.screenId, ...extra });
  const itRemise: SignatureSpec = { type: 'it_cachet', signed: true, pdfType: 'mise_disposition' };
  const itRestitution: SignatureSpec = { type: 'it_cachet', signed: true, pdfType: 'restitution' };
  const remiseSigned: SignatureSpec = { type: 'mise_disposition', signed: true };
  const restitutionSigned: SignatureSpec = { type: 'restitution', signed: true };
  const { collaborator } = people;
  return [
    { key: 'draft', status: 'draft', collaborateur: collaborator, equipments: [laptop({ serialNumber: DUPLICATE_SERIAL })], signatures: [] },
    {
      key: 'sentMiseDispo', status: 'sent_mise_dispo', collaborateur: collaborator,
      equipments: [screen({ serialNumber: 'SN-CONTRAT-ECRAN-1' })],
      signatures: [itRemise, { type: 'mise_disposition', signed: false, token: PENDING_REMISE_TOKEN }],
    },
    {
      key: 'active', status: 'active', collaborateur: collaborator, dateRestitutionDaysFromNow: -3,
      equipments: [laptop({ serialNumber: DUPLICATE_SERIAL, inventoryNumber: INVENTORY_NUMBER }), screen(), { catalogItemId: null, customLabel: 'Sacoche' }],
      signatures: [itRemise, { ...remiseSigned, token: SIGNED_TOKEN }],
    },
    {
      key: 'sentRestitution', status: 'sent_restitution', collaborateur: collaborator,
      equipments: [laptop({ serialNumber: 'SN-CONTRAT-RESTIT-1' })],
      signatures: [itRemise, remiseSigned, itRestitution, { type: 'restitution', signed: false, token: PENDING_RESTITUTION_TOKEN }],
    },
    {
      key: 'partiallyReturned', status: 'partially_returned', collaborateur: collaborator,
      equipments: [laptop({ serialNumber: 'SN-CONTRAT-PARTIEL-1', returned: true }), screen({ serialNumber: 'SN-CONTRAT-PARTIEL-2' })],
      signatures: [itRemise, remiseSigned, itRestitution, restitutionSigned],
    },
    {
      key: 'archived', status: 'archived', collaborateur: collaborator,
      equipments: [laptop({ serialNumber: 'SN-CONTRAT-CLOS-1', returned: true })],
      signatures: [itRemise, remiseSigned, itRestitution, restitutionSigned],
    },
    { key: 'cancelled', status: 'cancelled', collaborateur: collaborator, equipments: [screen()], signatures: [] },
    {
      key: 'contested', status: 'contested', collaborateur: collaborator,
      equipments: [screen({ serialNumber: 'SN-CONTRAT-CONTESTE-1' })],
      signatures: [itRemise, { type: 'mise_disposition', signed: false }],
    },
    {
      key: 'otherCollaboratorActive', status: 'active', collaborateur: people.otherCollaborator,
      equipments: [laptop({ serialNumber: 'SN-CONTRAT-AUTRE-1' })], signatures: [itRemise, remiseSigned],
    },
    {
      key: 'departedActive', status: 'active', collaborateur: people.departed,
      equipments: [laptop({ serialNumber: 'SN-CONTRAT-DEPART-1' })], signatures: [itRemise, remiseSigned],
    },
  ];
}

interface BonContext {
  filialeId: string;
  people: SeededPeople;
  catalog: SeededCatalog;
}

async function createBon(prisma: PrismaClient, context: BonContext, spec: BonSpec, index: number): Promise<SeededBon> {
  const reference = `BON-${CONTRACT_YEAR}-${String(9001 + index)}`;
  const bon = await prisma.bon.create({
    data: {
      reference,
      filialeId: context.filialeId,
      collaborateurId: spec.collaborateur.id,
      collaborateurEmail: spec.collaborateur.email,
      createdById: context.people.technician.id,
      civilite: 'mme',
      status: spec.status,
      dateMiseDisposition: daysFromNow(-30),
      dateRestitution: spec.dateRestitutionDaysFromNow === undefined ? null : daysFromNow(spec.dateRestitutionDaysFromNow),
      notes: `Bon de contrat « ${spec.key} »`,
      archivedAt: spec.status === 'archived' ? daysFromNow(-1) : null,
      equipments: {
        create: spec.equipments.map((equipment, order) => ({
          catalogItemId: equipment.catalogItemId,
          customLabel: equipment.customLabel ?? null,
          serialNumber: equipment.serialNumber ?? null,
          inventoryNumber: equipment.inventoryNumber ?? null,
          returnedAt: equipment.returned ? daysFromNow(-2) : null,
          order,
        })),
      },
      signatures: {
        create: spec.signatures.map((signature) =>
          signatureData(signature, spec.collaborateur, context.people.technician),
        ),
      },
    },
    include: { equipments: { orderBy: { order: 'asc' } } },
  });
  return { id: bon.id, reference, equipmentIds: bon.equipments.map((e) => e.id) };
}

/** Un document PDF déjà figé pour le bon en cours, comme après une signature. */
async function seedPdfSnapshot(prisma: PrismaClient, bon: SeededBon): Promise<void> {
  const data = Buffer.from('%PDF-1.4\n% document de contrat\n%%EOF\n');
  await prisma.pdfSnapshot.create({
    data: {
      bonId: bon.id,
      type: 'signature_collab_mise_disposition',
      data,
      filename: `${bon.reference}-mise-a-disposition.pdf`,
      sha256: createHash('sha256').update(data).digest('hex'),
    },
  });
}

export async function seedBons(prisma: PrismaClient, context: BonContext): Promise<SeededBons> {
  const specs = bonSpecs(context.people, context.catalog);
  const entries: [BonFixtureKey, SeededBon][] = [];
  for (const [index, spec] of specs.entries()) {
    // Un à un : les références doivent suivre l'ordre de création.
    entries.push([spec.key, await createBon(prisma, context, spec, index)]);
  }
  const bons = Object.fromEntries(entries) as Record<BonFixtureKey, SeededBon>;
  await seedPdfSnapshot(prisma, bons.active);
  return bons;
}
