import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfSnapshotType, SignatureType } from '../common/types';
import type { BonForPdf } from './pdf-types';
import { documentFilename } from './snapshot-filename';

// ─── Régénération des snapshots manquants ────────────────────────────────────
// Fonctions pures (au sens : aucune dépendance implicite) extraites de
// PdfService — elles reçoivent explicitement prisma/logger/encryption plutôt
// que d'être des méthodes d'instance, pour garder pdf.service.ts en façade.

export interface SnapshotRegenerationDeps {
  prisma: PrismaService;
  logger: Logger;
  /** Délègue à PdfService.generateAndSave — qui choisit lui-même les
   *  signatures du document, ne produit jamais deux fois le document d'une
   *  signature et écrit la chaîne de preuve de façon atomique. */
  generateAndSave: (bon: BonForPdf, snapshotType: string, filename: string) => Promise<Buffer>;
}

/** Document d'une signature IT d'après son `pdfType`. L'avenant n'est pas
 *  régénérable : il ne liste que les équipements retrouvés CE jour-là, que
 *  la base ne permet pas de retrouver. */
const IT_SNAPSHOT_BY_PDF_TYPE: Readonly<Record<string, PdfSnapshotType>> = Object.freeze({
  mise_disposition: PdfSnapshotType.signature_it_mise_disposition,
  restitution: PdfSnapshotType.signature_it_restitution,
  pv_cloture: PdfSnapshotType.cloture_equipements_manquants,
});

/**
 * Régénère les PdfSnapshot manquants pour toute Signature déjà signée dont
 * le document de preuve correspondant n'existe pas en base (ex. incident,
 * perte de données partielle, migration). Le rendu reste déterministe :
 * la régénération ne modifie jamais le contenu métier du bon, elle ne fait
 * que reconstruire un document déjà dû.
 *
 * Déduction du type de snapshot pour une signature IT (`it_cachet`) : le
 * champ `Signature.pdfType` (`mise_disposition`, `restitution`, `pv_cloture`,
 * `avenant`) fait foi quand il est présent. Limite connue : pour les
 * signatures antérieures à son introduction (`pdfType` null), le document
 * est déduit par ordre chronologique parmi les signatures IT du même bon
 * (1re = mise à disposition, suivantes = restitution) — une heuristique qui
 * peut être prise en défaut sur un historique non standard. Le PV signé par
 * l'IT n'est régénéré que s'il a été émis. Les documents
 * des gestes sans signature ne sont pas régénérés : leur constat (motif,
 * technicien, date) vient de l'événement qui les a produits.
 */
export async function regenerateMissingSnapshots(
  deps: SnapshotRegenerationDeps,
): Promise<{ regenerated: number; failed: number }> {
  const { prisma, logger, generateAndSave } = deps;
  let regenerated = 0;
  let failed = 0;

  const signedSignatures = await prisma.signature.findMany({
    where: {
      signed: true,
      type: {
        in: [
          SignatureType.mise_disposition,
          SignatureType.restitution,
          SignatureType.pv_cloture,
          SignatureType.it_cachet,
        ],
      },
    },
    orderBy: { signedAt: 'asc' },
    select: { bonId: true, type: true, pdfType: true },
  });

  const byBon = new Map<string, typeof signedSignatures>();
  for (const sig of signedSignatures) {
    const list = byBon.get(sig.bonId);
    if (list) list.push(sig);
    else byBon.set(sig.bonId, [sig]);
  }
  const pvEmitted = await bonsWithEmittedPv(prisma, [...byBon.keys()]);

  for (const [bonId, sigs] of byBon) {
    const targets = expectedDocuments(sigs, pvEmitted.has(bonId));
    for (const snapshotType of targets) {
      try {
        // Un seul document manquant se reconstruit : la version en vigueur
        // (l'état actuel du bon). Les versions antérieures d'un type déjà
        // présent ne sont jamais recalculées.
        const existing = await prisma.pdfSnapshot.findFirst({
          where: { bonId, type: snapshotType },
          select: { id: true },
        });
        if (existing) continue;

        const bon = await loadBonForPdf(prisma, bonId);
        if (!bon) {
          failed++;
          logger.warn(`Régénération snapshot ${snapshotType} ignorée : bon ${bonId} introuvable`);
          continue;
        }

        await generateAndSave(bon, snapshotType, documentFilename(bon, snapshotType, new Date()));
        regenerated++;
      } catch (err) {
        failed++;
        logger.error(`Échec régénération snapshot ${snapshotType} (bon ${bonId}): ${(err as Error).message}`);
      }
    }
  }

  logger.log(`Régénération des snapshots manquants terminée : ${regenerated} régénéré(s), ${failed} échec(s)`);
  return { regenerated, failed };
}

interface SignedSignature {
  type: SignatureType;
  pdfType: string | null;
}

/**
 * Bons dont le PV de non-restitution a été émis. La signature IT du PV est
 * recueillie dès la déclaration de non-restitution, mais le PV n'est émis
 * que lorsque plus rien n'est chez le collaborateur : sans émission, aucun
 * PV n'est dû et la régénération ne doit pas en fabriquer un.
 */
async function bonsWithEmittedPv(prisma: PrismaService, bonIds: readonly string[]): Promise<Set<string>> {
  if (bonIds.length === 0) return new Set();
  const rows = await prisma.auditLog.findMany({
    where: { bonId: { in: [...bonIds] }, action: 'pv_cloture_emitted' },
    select: { bonId: true },
  });
  return new Set(rows.flatMap((r) => (r.bonId ? [r.bonId] : [])));
}

/** Documents dus d'un bon d'après ses signatures signées (plus ancienne
 *  d'abord). Voir la limite de l'heuristique chronologique ci-dessus. */
function expectedDocuments(sigs: readonly SignedSignature[], pvEmitted: boolean): Set<PdfSnapshotType> {
  const targets = new Set<PdfSnapshotType>();
  let itCachetCount = 0;
  for (const sig of sigs) {
    if (sig.type === SignatureType.mise_disposition) {
      targets.add(PdfSnapshotType.signature_collab_mise_disposition);
    } else if (sig.type === SignatureType.restitution) {
      targets.add(PdfSnapshotType.signature_collab_restitution);
    } else if (sig.type === SignatureType.pv_cloture) {
      targets.add(PdfSnapshotType.cloture_equipements_manquants);
    } else if (sig.type === SignatureType.it_cachet) {
      itCachetCount++;
      const snapshotType = itSnapshotType(sig.pdfType, itCachetCount);
      if (snapshotType && (snapshotType !== PdfSnapshotType.cloture_equipements_manquants || pvEmitted)) {
        targets.add(snapshotType);
      }
    }
  }
  return targets;
}

/** pdfType fait foi quand renseigné ; sinon repli sur l'ordre chronologique.
 *  L'avenant n'est jamais régénéré (`null`). */
function itSnapshotType(pdfType: string | null, rank: number): PdfSnapshotType | null {
  if (pdfType === 'avenant') return null;
  if (pdfType) return IT_SNAPSHOT_BY_PDF_TYPE[pdfType] ?? null;
  return rank === 1 ? PdfSnapshotType.signature_it_mise_disposition : PdfSnapshotType.signature_it_restitution;
}

/** Recharge un bon avec toutes les relations nécessaires au rendu PDF. */
async function loadBonForPdf(prisma: PrismaService, bonId: string): Promise<BonForPdf | null> {
  const bon = await prisma.bon.findUnique({
    where: { id: bonId },
    include: {
      filiale: true,
      collaborateur: { select: { displayName: true, department: true } },
      createdBy: { select: { displayName: true } },
      equipments: {
        orderBy: { order: 'asc' },
        include: { catalogItem: { select: { brand: true, model: true } } },
      },
      signatures: true,
    },
  });
  return bon;
}
