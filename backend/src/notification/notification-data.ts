import type { PdfSnapshotType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationBon } from '../common/types';
import type { EmailAttachment } from './senders/notification-senders';

/**
 * Lectures en base propres aux emails : le bon tel qu'un email le montre, et
 * le PDF signé joint à une confirmation.
 */

/** Ce qu'un email affiche d'un bon (jamais la note interne IT). */
const NOTIFICATION_BON_SELECT = {
  id: true,
  reference: true,
  civilite: true,
  status: true,
  collaborateurEmail: true,
  dateMiseDisposition: true,
  dateRestitution: true,
  collaborateur: { select: { displayName: true, email: true } },
  filiale: { select: { displayName: true, name: true } },
  equipments: {
    orderBy: { order: 'asc' as const },
    select: {
      id: true, order: true, customLabel: true, serialNumber: true, returnedAt: true, notReturned: true,
      notReturnedReason: true, catalogItem: { select: { brand: true, model: true } },
    },
  },
} as const;

export async function loadNotificationBon(prisma: PrismaService, bonId: string): Promise<NotificationBon | null> {
  return prisma.bon.findUnique({ where: { id: bonId }, select: NOTIFICATION_BON_SELECT });
}

/** Au-delà, le PDF n'est pas joint (le lien vers le portail suffit) : les
 *  messageries refusent souvent les gros envois. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** Document signé par le collaborateur → type du PDF enregistré. */
const SIGNED_SNAPSHOT_TYPES: Readonly<Record<'mise_disposition' | 'restitution' | 'pv_cloture', PdfSnapshotType>> = Object.freeze({
  mise_disposition: 'signature_collab_mise_disposition',
  restitution: 'signature_collab_restitution',
  pv_cloture: 'cloture_equipements_manquants',
});

/** Le PDF signé du document, s'il existe et reste d'une taille raisonnable. */
export async function loadSignedDocumentAttachment(
  prisma: PrismaService,
  bonId: string,
  documentType: keyof typeof SIGNED_SNAPSHOT_TYPES,
): Promise<EmailAttachment | null> {
  const snapshot = await prisma.pdfSnapshot.findUnique({
    where: { bonId_type: { bonId, type: SIGNED_SNAPSHOT_TYPES[documentType] } },
    select: { data: true, filename: true },
  });
  if (!snapshot || snapshot.data.length > MAX_ATTACHMENT_BYTES) return null;
  return { filename: snapshot.filename, content: Buffer.from(snapshot.data), contentType: 'application/pdf' };
}
