import { Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { PdfSnapshotType, SignatureType } from '../common/types';
import { BonForPdf, SigImages } from './pdf.service';

// ─── Régénération des snapshots manquants ────────────────────────────────────
// Fonctions pures (au sens : aucune dépendance implicite) extraites de
// PdfService — elles reçoivent explicitement prisma/logger/encryption plutôt
// que d'être des méthodes d'instance, pour garder pdf.service.ts en façade.

export interface SnapshotRegenerationDeps {
  prisma: PrismaService;
  encryption: EncryptionService;
  /** Répertoire des signatures manuscrites chiffrées (PdfService.signaturesDir). */
  signaturesDir: string;
  logger: Logger;
  /** Délègue à PdfService.generateAndSave — préserve le comportement
   *  d'écrasement (jamais pour une mise à disposition déjà signée) et la
   *  chaîne de preuve atomique, tous deux implémentés dans la façade. */
  generateAndSave: (bon: BonForPdf, snapshotType: string, sigImages: SigImages, filename: string) => Promise<Buffer>;
}

/**
 * Régénère les PdfSnapshot manquants pour toute Signature déjà signée dont
 * le document de preuve correspondant n'existe pas en base (ex. incident,
 * perte de données partielle, migration). Le rendu reste déterministe :
 * la régénération ne modifie jamais le contenu métier du bon, elle ne fait
 * que reconstruire un document déjà dû.
 *
 * Déduction du type de snapshot pour un cachet IT (`it_cachet`) : le champ
 * `Signature.pdfType` ('mise_disposition' | 'restitution', renseigné par
 * signItCachet depuis LOT H/B) fait foi quand il est présent. Limite
 * connue : pour les signatures antérieures à son introduction (`pdfType`
 * null), la phase est déduite par ordre chronologique parmi les cachets IT
 * signés du même bon (1er = mise à disposition, suivants = restitution) —
 * une heuristique qui peut être prise en défaut sur un historique non
 * standard (plusieurs cycles de restitution partielle avec plusieurs
 * cachets non typés).
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

  for (const [bonId, sigs] of byBon) {
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
        // pdfType fait foi quand renseigné ; sinon repli sur l'ordre
        // chronologique (voir limite documentée ci-dessus).
        const snapshotType = sig.pdfType === 'restitution'
          ? PdfSnapshotType.signature_it_restitution
          : sig.pdfType === 'mise_disposition'
            ? PdfSnapshotType.signature_it_mise_disposition
            : (itCachetCount === 1
                ? PdfSnapshotType.signature_it_mise_disposition
                : PdfSnapshotType.signature_it_restitution);
        targets.add(snapshotType);
      }
    }

    for (const snapshotType of targets) {
      try {
        const existing = await prisma.pdfSnapshot.findUnique({
          where: { bonId_type: { bonId, type: snapshotType } },
          select: { id: true },
        });
        if (existing) continue;

        const bon = await loadBonForPdf(prisma, bonId);
        if (!bon) {
          failed++;
          logger.warn(`Régénération snapshot ${snapshotType} ignorée : bon ${bonId} introuvable`);
          continue;
        }

        const sigImages = await buildSigImagesForRegeneratedSnapshot(bon, snapshotType, deps);
        const collabPart = toFilenamePart(bon.collaborateur?.displayName || 'INCONNU');
        const filename = `${bon.reference}_${collabPart}_${snapshotType}.pdf`;
        await generateAndSave(bon, snapshotType, sigImages, filename);
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

/**
 * Reconstruit les SigImages pertinentes pour un type de snapshot donné —
 * même logique que SignatureService.buildSigImagesForSnapshot (dupliquée :
 * le module signature dépend déjà du module pdf, l'inverse créerait un cycle).
 */
async function buildSigImagesForRegeneratedSnapshot(
  bon: BonForPdf,
  snapshotType: string,
  deps: Pick<SnapshotRegenerationDeps, 'encryption' | 'signaturesDir'>,
): Promise<SigImages> {
  const sigImages: SigImages = { it: null, collab: null };
  for (const sig of bon.signatures || []) {
    if (!sig.signed || !sig.signatureImagePath) continue;
    const raw = await getSignatureImageDecrypted(sig.signatureImagePath, deps);
    if (!raw) continue;
    const src = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;

    if (sig.type === 'it_cachet') {
      sigImages.it = src;
    } else if (snapshotType === 'cloture_equipements_manquants') {
      if (sig.type === 'pv_cloture') sigImages.collab = src;
    } else if (snapshotType.includes('collab')) {
      const isRestitutionSnapshot = snapshotType.includes('restitution');
      const isRestitutionSig = sig.type === 'restitution';
      if (isRestitutionSnapshot === isRestitutionSig) sigImages.collab = src;
    }
  }
  return sigImages;
}

/** Déchiffre une image de signature stockée sur disque (usage PDF uniquement). */
async function getSignatureImageDecrypted(
  signatureImagePath: string,
  deps: Pick<SnapshotRegenerationDeps, 'encryption' | 'signaturesDir'>,
): Promise<string | null> {
  try {
    const base = basename(signatureImagePath);
    if (base !== signatureImagePath) return null;
    const fullPath = join(deps.signaturesDir, base);
    if (!fullPath.startsWith(deps.signaturesDir) || !existsSync(fullPath)) return null;
    const encrypted = await readFile(fullPath, 'utf8');
    return deps.encryption.decrypt(encrypted);
  } catch {
    return null;
  }
}

/** Fragment de nom de fichier sûr (sans accents/espaces) — usage interne uniquement. */
export function toFilenamePart(name: string): string {
  // Retire les diacritiques laissés par normalize('NFKD') (plage Unicode
  // « Combining Diacritical Marks », U+0300-U+036F). Filtrage par code
  // point plutôt que par classe de caractères regex, pour éviter toute
  // ambiguïté d'échappement Unicode dans la classe de caractères.
  const COMBINING_MARKS_START = 0x0300;
  const COMBINING_MARKS_END = 0x036f;
  let withoutDiacritics = '';
  for (const ch of name.normalize('NFKD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= COMBINING_MARKS_START && code <= COMBINING_MARKS_END) continue;
    withoutDiacritics += ch;
  }
  const cleaned = withoutDiacritics
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'INCONNU';
}
