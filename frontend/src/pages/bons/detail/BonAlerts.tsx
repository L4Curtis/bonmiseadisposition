import { AlertTriangle, Info, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { WITHOUT_SIGNATURE_DONE_LABELS } from '@/domain/labels';
import type { BonFiche } from './types';

type Tone = 'info' | 'warning';

const TONES: Readonly<Record<Tone, string>> = {
  info: 'border-border bg-muted/40 text-foreground',
  warning: 'border-warning/40 bg-warning/10 text-warning',
};

function Banner({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div role={tone === 'warning' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <div className="text-xs opacity-90">{children}</div>
      </div>
    </div>
  );
}

const CLOSED: readonly string[] = ['archived', 'cancelled'];

/** Pourquoi aucun lien ne part (règle unique canSendLink, R-004, R-009,
 *  R-034) : un départ, un compagnon sans adresse (fonctionnement normal) ou
 *  une adresse à corriger. Rien pour un bon clos. */
function LinkRefusalBanner({ bon }: { bon: BonFiche }) {
  const refusal = bon.linkRefusal;
  if (!refusal || CLOSED.includes(bon.status)) return null;
  if (refusal.reason === 'inactive_account') {
    return (
      <Banner tone="warning" icon={<UserX className="h-4 w-4" />} title="Compte du collaborateur désactivé">
        Plus aucun lien ni rappel ne lui est envoyé. Faites signer la restitution au guichet ; à défaut, déclarez les
        équipements non restitués puis clôturez sans signature, avec un motif.
      </Banner>
    );
  }
  if (refusal.reason === 'no_email') {
    return (
      <Banner tone="info" icon={<Info className="h-4 w-4" />} title="Signature au guichet uniquement">
        Ce collaborateur n’a pas d’adresse email : ses documents se signent sur place, sur votre écran ou votre tablette.
      </Banner>
    );
  }
  return (
    <Banner tone="warning" icon={<AlertTriangle className="h-4 w-4" />} title="Adresse email du collaborateur non valide">
      {refusal.message}
    </Banner>
  );
}

/** Motifs des gestes tracés, lisibles sans ouvrir le journal. */
function ReasonBanners({ bon }: { bon: BonFiche }) {
  return (
    <>
      {bon.cancellationReason && bon.status === 'cancelled' && (
        <Banner tone="info" icon={<Info className="h-4 w-4" />} title="Bon annulé">
          Motif : {bon.cancellationReason}
        </Banner>
      )}
      {bon.handoverWithoutSignatureReason && (
        <Banner tone="info" icon={<Info className="h-4 w-4" />} title={WITHOUT_SIGNATURE_DONE_LABELS.handover_without_signature}>
          Motif : {bon.handoverWithoutSignatureReason}
        </Banner>
      )}
      {bon.closedWithoutSignatureReason && (
        <Banner tone="info" icon={<Info className="h-4 w-4" />} title={WITHOUT_SIGNATURE_DONE_LABELS.closed_without_signature}>
          Motif : {bon.closedWithoutSignatureReason}
        </Banner>
      )}
    </>
  );
}

export function BonAlerts({ bon }: { bon: BonFiche }) {
  return (
    <>
      <LinkRefusalBanner bon={bon} />
      <ReasonBanners bon={bon} />
    </>
  );
}
