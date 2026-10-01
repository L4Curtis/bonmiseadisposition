/**
 * Documents probants contre une VRAIE base PostgreSQL : un document par
 * signature, jamais écrasé (deux restitutions signées donnent deux documents,
 * chacun avec sa date et son empreinte), l'empreinte tracée dans l'audit est
 * toujours celle d'un document encore téléchargeable, et le document d'une
 * même signature n'est produit qu'une fois. Et l'indicateur « Par une personne
 * mandatée » ne compte pas une signature au guichet faite devant un technicien.
 *
 *   cd backend && RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/pdf/__tests__/pdf-snapshot-history.real-db.spec.ts
 */
import { PrismaService } from '../../prisma/prisma.service';
import { PdfService } from '../pdf.service';
import { PdfTemplatesService } from '../pdf-templates.service';
import { DEFAULT_CONFIGS } from '../pdf-template-defaults';
import { EncryptionService } from '../../config/encryption.service';
import { listBonDocuments } from '../snapshot-list';
import { findDocumentById } from '../snapshot-store';
import { querySignatureModes } from '../../kpi/delais/delais-queries';
import { todayInParis } from '../../common/dates/paris';
import type { BonForPdf } from '../pdf-types';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

const TEST_PREFIX = 'zz-r1-docs';

describeDb('Documents probants et mandataires (base réelle)', () => {
  let prisma: PrismaService;
  let pdf: PdfService;
  let bonId: string;

  const templates = { getTemplateConfig: (id: string) => Promise.resolve(structuredClone(DEFAULT_CONFIGS[id])) } as unknown as PdfTemplatesService;
  const encryption = { decrypt: (v: string) => v } as unknown as EncryptionService;

  async function cleanup(): Promise<void> {
    await prisma.bon.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await prisma.filiale.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  }

  async function signature(type: 'it_cachet' | 'restitution', signedAt: Date, extra: Record<string, unknown> = {}) {
    return prisma.signature.create({
      data: {
        bonId, type, token: `${TEST_PREFIX}-${type}-${signedAt.getTime()}-${Math.random()}`, tokenExpiresAt: new Date(0),
        signed: true, signedAt, signerEmail: `${TEST_PREFIX}-lea@test.local`, mentionLuApprouve: true,
        pdfType: type === 'it_cachet' ? 'restitution' : type, ...extra,
      },
    });
  }

  async function bonForPdf(): Promise<BonForPdf> {
    const bon = await prisma.bon.findUniqueOrThrow({
      where: { id: bonId },
      include: { filiale: true, collaborateur: true, equipments: true, signatures: true },
    });
    return bon as unknown as BonForPdf;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    pdf = new PdfService(prisma, templates, encryption);
    await cleanup();
    const filiale = await prisma.filiale.create({ data: { name: `${TEST_PREFIX}-f`, displayName: `${TEST_PREFIX} F` } });
    const lea = await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-lea`, email: `${TEST_PREFIX}-lea@test.local`, displayName: 'Léa Martin', role: 'collaborator' },
    });
    const bon = await prisma.bon.create({
      data: {
        reference: `${TEST_PREFIX}-1`, filialeId: filiale.id, collaborateurId: lea.id, createdById: lea.id, civilite: 'mme',
        collaborateurEmail: lea.email, status: 'partially_returned', dateMiseDisposition: new Date('2026-09-01T08:00:00Z'),
        equipments: { create: [{ customLabel: 'PC', order: 0, returnedAt: new Date() }, { customLabel: 'Écran', order: 1 }] },
      },
    });
    bonId = bon.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('deux restitutions signées : deux documents conservés, datés, avec l’empreinte de l’audit', async () => {
    await signature('it_cachet', new Date('2026-09-27T12:59:00Z'));
    await signature('restitution', new Date('2026-09-27T13:03:00Z'));
    const first = await pdf.saveDocument(await bonForPdf(), 'signature_collab_restitution', 'premiere.pdf');
    await signature('it_cachet', new Date('2026-09-27T13:03:30Z'));
    await signature('restitution', new Date('2026-09-27T13:04:00Z'));
    const second = await pdf.saveDocument(await bonForPdf(), 'signature_collab_restitution', 'seconde.pdf');

    expect(first.created && second.created).toBe(true);
    const documents = (await listBonDocuments(prisma, bonId, 'it')).filter((d) => d.type === 'signature_collab_restitution');
    expect(documents.map((d) => [d.filename, d.sequence, d.sequenceCount, d.latest])).toEqual([
      ['premiere.pdf', 1, 2, false],
      ['seconde.pdf', 2, 2, true],
    ]);
    expect(documents.every((d) => d.signatureType === 'restitution')).toBe(true);

    const audited = await prisma.auditLog.findMany({ where: { bonId, action: 'pdf_snapshot_saved' } });
    const auditedHashes = audited.map((a) => (a.details as { sha256: string }).sha256);
    expect(documents.map((d) => d.sha256)).toEqual(expect.arrayContaining(auditedHashes.slice(-2)));
  });

  it('même signature demandée deux fois : un seul document, le premier est renvoyé', async () => {
    const again = await pdf.saveDocument(await bonForPdf(), 'signature_collab_restitution', 'doublon.pdf');
    expect(again).toMatchObject({ created: false, filename: 'seconde.pdf' });
    expect(await prisma.pdfSnapshot.count({ where: { bonId, type: 'signature_collab_restitution' } })).toBe(2);
  });

  it('PV réémis avec la même signature IT mais un autre contenu : les deux versions sont conservées', async () => {
    const itPv = await signature('it_cachet', new Date('2026-09-27T14:00:00Z'), { pdfType: 'pv_cloture' });
    await prisma.bonEquipment.updateMany({ where: { bonId, returnedAt: null }, data: { notReturned: true, notReturnedReason: 'Perdu' } });
    const first = await pdf.saveDocument(await bonForPdf(), 'cloture_equipements_manquants', 'pv-1.pdf');
    // Un équipement de plus est déclaré non restitué : le PV réémis diffère.
    await prisma.bonEquipment.create({ data: { bonId, customLabel: 'Souris', order: 2, notReturned: true, notReturnedReason: 'Perdue' } });
    const second = await pdf.saveDocument(await bonForPdf(), 'cloture_equipements_manquants', 'pv-2.pdf');
    const again = await pdf.saveDocument(await bonForPdf(), 'cloture_equipements_manquants', 'pv-3.pdf');

    expect([first.created, second.created, again.created]).toEqual([true, true, false]);
    expect(again.filename).toBe('pv-2.pdf');
    const pvs = await prisma.pdfSnapshot.findMany({ where: { bonId, type: 'cloture_equipements_manquants' }, orderBy: { createdAt: 'asc' } });
    expect(pvs.map((p) => [p.filename, p.signatureId])).toEqual([['pv-1.pdf', itPv.id], ['pv-2.pdf', itPv.id]]);
    expect(pvs[0].sha256).not.toBe(pvs[1].sha256);
  });

  it('collaborateur : ni le PV signé par l’IT seule, ni une signature IT, en liste comme par identifiant', async () => {
    const itOnly = await pdf.saveDocument(await bonForPdf(), 'signature_it_restitution', 'it-seule.pdf');
    expect(itOnly.created).toBe(true);
    const all = await listBonDocuments(prisma, bonId, 'it');
    const mine = await listBonDocuments(prisma, bonId, 'collaborator');

    expect(all.some((d) => d.type === 'cloture_equipements_manquants')).toBe(true);
    expect(mine.map((d) => d.type)).toEqual(['signature_collab_restitution', 'signature_collab_restitution']);
    expect(mine.map((d) => [d.sequence, d.sequenceCount])).toEqual([[1, 2], [2, 2]]);
    const hidden = all.filter((d) => !mine.some((m) => m.id === d.id));
    for (const doc of hidden) {
      expect(await findDocumentById(prisma, bonId, doc.id, 'collaborator')).toBeNull();
      expect(await findDocumentById(prisma, bonId, doc.id, 'it')).not.toBeNull();
    }
  });

  it('« Par une personne mandatée » : un technicien au guichet est un témoin, un tiers est compté', async () => {
    const tech = await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-tech`, email: `${TEST_PREFIX}-tech@test.local`, displayName: 'Thomas', role: 'technician', isItStaff: true },
    });
    await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-tiers`, email: `${TEST_PREFIX}-tiers@test.local`, displayName: 'Tiers', role: 'collaborator' },
    });
    const now = new Date();
    // Ancienne écriture (technicien marqué mandataire), nouvelle écriture (témoin), vrai mandataire.
    await signature('restitution', now, { isInPerson: true, signedByProxy: true, signerEmail: tech.email });
    await signature('restitution', new Date(now.getTime() + 1000), { isInPerson: true, signedByProxy: false, signerEmail: tech.email });
    await signature('restitution', new Date(now.getTime() + 2000), { isInPerson: true, signedByProxy: true, signerEmail: `${TEST_PREFIX}-tiers@test.local` });

    const filiale = await prisma.bon.findUniqueOrThrow({ where: { id: bonId }, select: { filialeId: true } });
    const today = todayInParis();
    const modes = await querySignatureModes(prisma, { from: today, to: today }, filiale.filialeId);
    expect(modes.inPerson).toBe(3);
    expect(modes.proxy).toBe(1);
  });
});
