import type { PdfSnapshotType } from '@prisma/client';
import { attachmentFilename } from '../pdf/snapshot-filename';
import type { RejectionContext } from './messages/contestation-messages';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationBon } from '../common/types';
import type { EmailAttachment } from './senders/notification-senders';
import { INVALIDATED_TOKEN_SENTINEL } from '../common/bon-predicates';

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

/**
 * Le PDF signé du document, s'il existe et reste d'une taille raisonnable :
 * le plus récent de son type (celui que la confirmation annonce), sous un nom
 * de pièce jointe lisible (« BON-2026-0074_Bon-de-restitution-signe_2026-09-27.pdf »).
 */
export async function loadSignedDocumentAttachment(
  prisma: PrismaService,
  bonId: string,
  documentType: keyof typeof SIGNED_SNAPSHOT_TYPES,
): Promise<EmailAttachment | null> {
  const type = SIGNED_SNAPSHOT_TYPES[documentType];
  const snapshot = await prisma.pdfSnapshot.findFirst({
    where: { bonId, type },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { data: true, createdAt: true, bon: { select: { reference: true } } },
  });
  if (!snapshot || snapshot.data.length > MAX_ATTACHMENT_BYTES) return null;
  return {
    filename: attachmentFilename(snapshot.bon.reference, type, snapshot.createdAt),
    content: Buffer.from(snapshot.data),
    contentType: 'application/pdf',
  };
}

/**
 * Ce que le bon attend encore du collaborateur quand sa contestation n'est
 * pas retenue : le lien du document en attente (jamais au guichet, jamais un
 * lien remplacé ou invalidé), en disant s'il a expiré entre-temps, et s'il a
 * déjà signé un document de ce bon.
 */
export async function loadRejectionContext(
  prisma: PrismaService,
  bonId: string,
  appUrl: string,
  now: Date = new Date(),
): Promise<RejectionContext> {
  const [pending, signedCount] = await Promise.all([
    prisma.signature.findFirst({
      where: {
        bonId, signed: false, isInPerson: false, invalidatedAt: null,
        type: { not: 'it_cachet' }, tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
      },
      orderBy: { createdAt: 'desc' },
      select: { token: true, type: true, tokenExpiresAt: true },
    }),
    prisma.signature.count({ where: { bonId, signed: true, type: { not: 'it_cachet' } } }),
  ]);
  return {
    signUrl: pending ? `${appUrl}/signer/${pending.token}` : null,
    documentType: pending ? (pending.type as NonNullable<RejectionContext['documentType']>) : null,
    linkExpired: pending ? pending.tokenExpiresAt.getTime() <= now.getTime() : false,
    signed: signedCount > 0,
  };
}
