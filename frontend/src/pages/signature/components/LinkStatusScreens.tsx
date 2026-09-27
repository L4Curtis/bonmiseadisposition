import { AlertOctagon, Ban, CheckCircle, Clock, Info } from 'lucide-react';
import type { SignatureInvalidationReason } from '@/contracts/common';
import { closedBonScreen, invalidatedLinkScreen } from '../lib/link-screens';
import { PortalLink, StatusScreen } from './StatusScreen';
import { RequestNewLinkButton } from './RequestNewLinkButton';

/** Lien expiré : deux issues, demander un nouveau lien ou voir ses équipements (R-058). */
export function ExpiredLinkScreen({ token, reference }: { token: string; reference: string }) {
  return (
    <StatusScreen
      icon={<Clock className="h-12 w-12 text-warning" />}
      title="Lien expiré"
      message="Ce lien de signature a expiré. Demandez-en un nouveau : l'équipe informatique est prévenue et vous en renvoie un."
      reference={reference}
      actions={
        <div className="flex flex-col gap-2 w-full">
          <RequestNewLinkButton token={token} />
          <PortalLink />
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
