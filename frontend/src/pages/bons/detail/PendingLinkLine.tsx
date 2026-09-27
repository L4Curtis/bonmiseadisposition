import type { PendingSignature } from '@/contracts';
import { formatDateLong, formatDateTime } from '@/lib/utils';

/**
 * État du lien du document en attente (R-016) : « Lien valable jusqu'au … »,
 * « Lien expiré le … » en rouge, « Lien invalidé », ou « Aucun lien envoyé ».
 */
export function PendingLinkLine({ pending }: { pending?: PendingSignature | null }) {
  if (!pending) return null;
  const where = pending.inPerson ? 'au guichet' : 'par email';
  if (!pending.expired && pending.expiresAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Lien {where} envoyé le {formatDateTime(pending.sentAt)} — valable jusqu’au {formatDateTime(pending.expiresAt)}.
      </p>
    );
  }
  if (pending.sentAt && pending.expiresAt) {
    return <p className="text-xs font-medium text-destructive">Lien {where} expiré le {formatDateLong(pending.expiresAt)}.</p>;
  }
  if (pending.sentAt) {
    return <p className="text-xs font-medium text-destructive">Le dernier lien ne vaut plus : un nouveau lien est nécessaire.</p>;
  }
  return <p className="text-xs text-muted-foreground">Aucun lien n’a encore été transmis pour ce document.</p>;
}
