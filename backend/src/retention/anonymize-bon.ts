import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { sanitizeAuditDetails } from './audit-sanitizer';

const SIGNATURES_DIR = path.join(process.cwd(), 'data', 'signatures');
const ANONYMIZED_EMAIL = 'anonymise@rgpd.local';

export interface AnonymizeBonDeps {
  prisma: PrismaService;
  attachments: AttachmentsService;
  logger: Logger;
}

/**
 * Anonymise un bon : purge PII + détruit les preuves (PDF, archives, signatures).
 *
 * Volontairement CONSERVÉ (valeur statistique / registre légal) : la
 * référence du bon, ses dates (mise à disposition, restitution, création,
 * mise à jour), les équipements (BonEquipment — modèles/catalogue), et la
 * filiale. Le compte "créateur" (createdById) n'est pas touché : il identifie
 * un membre du service IT, pas le collaborateur sujet du bon.
 */
export async function anonymizeBon(
  deps: AnonymizeBonDeps,
  bonId: string,
  triggeredByEmail?: string,
): Promise<number> {
  const { prisma, attachments, logger } = deps;

  // 1. Fichiers de signature chiffrés sur disque
  const sigs = await prisma.signature.findMany({
    where: { bonId, signatureImagePath: { not: null } },
    select: { signatureImagePath: true },
  });
  for (const s of sigs) {
    if (!s.signatureImagePath) continue;
    const basename = path.basename(s.signatureImagePath);
    const full = path.join(SIGNATURES_DIR, basename);
    if (full.startsWith(SIGNATURES_DIR) && fs.existsSync(full)) {
      await unlink(full).catch((err) =>
        logger.warn(
          `Fichier signature non supprimé (${basename}) lors de l'anonymisation du bon ${bonId}: ${(err as Error).message}`,
        ),
      );
    }
  }

  // 2. Pièces jointes (fichiers + lignes)
  const attachmentsPurged = await attachments.purgeForBon(bonId);

  // 3. Transaction : purge PII + preuves en base, marque anonymisé
  await prisma.$transaction(async (tx) => {
    const currentBon = await tx.bon.findUnique({
      where: { id: bonId },
      select: { collaborateurId: true, collaborateurEmail: true },
    });
    const oldEmailLower = currentBon?.collaborateurEmail?.toLowerCase();
    const oldCollaborateurId = currentBon?.collaborateurId;

    // Compte technique "anonymisé" — upsert : créé une seule fois, réutilisé
    // ensuite pour tous les bons anonymisés (idempotent, pas de course entre
    // deux runs qui tenteraient chacun de le créer).
    const anonymUser = await tx.user.upsert({
      where: { email: ANONYMIZED_EMAIL },
      update: {},
      create: {
        email: ANONYMIZED_EMAIL,
        samAccountName: 'anonymise_rgpd',
        displayName: 'Collaborateur anonymisé',
        role: 'collaborator',
        isLocalAccount: true,
        active: false,
        passwordHash: null,
      },
    });

    // Réassigne aussi les FK userId (pas seulement les champs texte email) :
    // Contestation et AuditLog sont chargés avec `include: user` ailleurs dans
    // l'app — sans ça, le nom/email réel du collaborateur réapparaîtrait via
    // la jointure malgré l'anonymisation des colonnes texte.
    if (oldCollaborateurId) {
      await tx.contestation.updateMany({
        where: { bonId, userId: oldCollaborateurId },
        data: { userId: anonymUser.id },
      });
      await tx.auditLog.updateMany({
        where: { bonId, userId: oldCollaborateurId },
        data: { userId: anonymUser.id },
      });
    }

    await tx.signature.updateMany({
      where: { bonId },
      data: {
        signerEmail: null,
        signerIp: null,
        signerUserAgent: null,
        signatureImagePath: null,
        // Les sceaux HMAC et jetons d'horodatage n'ont plus de sens une fois
        // les champs probants qu'ils couvrent (email, IP…) effacés
        seal: null,
        sealedAt: null,
        tsToken: null,
      },
    });
    // Preuves binaires (contiennent noms/emails/signatures) — durée légale expirée
    await tx.pdfSnapshot.deleteMany({ where: { bonId } });
    await tx.proofArchive.deleteMany({ where: { bonId } });

    await tx.notificationLog.updateMany({
      where: { bonId },
      data: { recipientEmail: ANONYMIZED_EMAIL },
    });

    await tx.contestation.updateMany({ where: { bonId }, data: { message: '[anonymisé]' } });
    await tx.smbExport.updateMany({ where: { bonId }, data: { filename: 'anonymise.pdf' } });

    // Journaux d'audit liés au bon : IP/UA systématiquement purgés ; l'email
    // n'est réécrit que s'il correspond au collaborateur (jamais un agent IT
    // ayant agi sur le bon), et les clés JSON pouvant porter des PII sont
    // retirées de `details`.
    const auditLogs = await tx.auditLog.findMany({
      where: { bonId },
      select: { id: true, userEmail: true, details: true },
    });
    for (const log of auditLogs) {
      const matchesCollaborateur =
        !!log.userEmail && !!oldEmailLower && log.userEmail.toLowerCase() === oldEmailLower;
      const sanitizedDetails = sanitizeAuditDetails(log.details);
      await tx.auditLog.update({
        where: { id: log.id },
        data: {
          userEmail: matchesCollaborateur ? ANONYMIZED_EMAIL : log.userEmail,
          ipAddress: null,
          userAgent: null,
          details: sanitizedDetails === null ? Prisma.JsonNull : (sanitizedDetails as Prisma.InputJsonValue),
        },
      });
    }

    // Anonymise les champs personnels du bon (conserve réf/dates/statut/équipements/filiale)
    await tx.bon.update({
      where: { id: bonId },
      data: {
        collaborateurId: anonymUser.id,
        collaborateurEmail: ANONYMIZED_EMAIL,
        notes: null,
        pdfMiseDispoSnapshot: null,
        pdfRestitutionSnapshot: null,
        anonymizedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        bonId,
        userEmail: triggeredByEmail ?? null,
        action: 'bon_anonymized',
        details: { reason: 'retention_rgpd' },
      },
    });
  });

  return attachmentsPurged;
}
