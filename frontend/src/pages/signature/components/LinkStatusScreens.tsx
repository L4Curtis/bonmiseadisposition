import { AlertOctagon, Ban, CheckCircle, Clock, Info } from 'lucide-react';
import type { SignatureInvalidationReason } from '@/contracts/common';
import { formatDateLong } from '@/lib/dates';
import { closedBonScreen, invalidatedLinkScreen } from '../lib/link-screens';
import { PortalLink, StatusScreen } from './StatusScreen';
import { RequestNewLinkButton } from './RequestNewLinkButton';

/** Lien expiré : deux issues, demander un nouveau lien ou voir ses
 *  équipements (R-058). Une demande déjà faite n'est pas reproposée : la page
 *  dit quand elle a été faite. */
export function ExpiredLinkScreen({
  token,
  reference,
  newLinkRequestedAt,
}: {
  token: string;
  reference: string;
  newLinkRequestedAt?: string | null;
}) {
  const requested = !!newLinkRequestedAt;
  return (
    <StatusScreen
      icon={<Clock className="h-12 w-12 text-warning" />}
      title="Lien expiré"
      message={
        requested
          ? `Nouveau lien demandé le ${formatDateLong(newLinkRequestedAt)} — l'équipe informatique va vous le renvoyer.`
          : "Ce lien de signature a expiré. Demandez-en un nouveau : l'équipe informatique est prévenue et vous en renvoie un."
      }
      reference={reference}
      actions={
        <div className="flex flex-col gap-2 w-full">
          {!requested && <RequestNewLinkButton token={token} />}
          <PortalLink primary={requested} />
        </div>
      }
    />
  );
}

/** Lien invalidé avant usage : le vrai motif (R-038). */
export function InvalidatedLinkScreen({
  reason,
  reference,
}: {
  reason: SignatureInvalidationReason | null | undefined;
  reference: string;
}) {
  const { title, message } = invalidatedLinkScreen(reason);
  const icon =
    reason === 'cancelled' ? (
      <Ban className="h-12 w-12 text-muted-foreground" />
    ) : reason === 'closed_without_signature' || reason === 'handover_without_signature' ? (
      <CheckCircle className="h-12 w-12 text-muted-foreground" />
    ) : (
      <Info className="h-12 w-12 text-warning" />
    );
  return <StatusScreen icon={icon} title={title} message={message} reference={reference} actions={<PortalLink primary />} />;
}

/** Bon annulé ou contesté : prioritaire sur « expiré » et « déjà signé ». */
export function ClosedBonScreen({ status, reference }: { status: 'cancelled' | 'contested'; reference: string }) {
  const { title, message } = closedBonScreen(status);
  const icon =
    status === 'cancelled' ? (
      <Ban className="h-12 w-12 text-muted-foreground" />
    ) : (
      <AlertOctagon className="h-12 w-12 text-destructive" />
    );
  return <StatusScreen icon={icon} title={title} message={message} reference={reference} actions={<PortalLink primary />} />;
}

/** Contestation envoyée depuis la page de signature. */
export function ContestationSentScreen({ reference }: { reference: string }) {
  return (
    <StatusScreen
      icon={<AlertOctagon className="h-12 w-12 text-destructive" />}
      title="Contestation envoyée"
      message="L'équipe informatique a reçu votre contestation. Vous suivez son traitement dans « Mes équipements » ; rien n'est à signer d'ici là."
      reference={reference}
      actions={<PortalLink primary />}
    />
  );
}
