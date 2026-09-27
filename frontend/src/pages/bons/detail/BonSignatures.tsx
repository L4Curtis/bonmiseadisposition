import { CheckCircle2, Clock, Stamp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import { LINK_INVALIDATION_LABELS, labelOrKey } from '@/domain/labels';
import { sigTypeLabel, type FicheSignature } from './types';

export interface BonSignaturesProps {
  readonly signatures: readonly FicheSignature[];
  /** Nom du collaborateur titulaire : c'est lui qui signe, même au guichet. */
  readonly collaborateurName: string;
}

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : 0);

/** Signature IT : document concerné et technicien qui a réellement signé. */
function itTitle(sig: FicheSignature): string {
  if (sig.pdfType === 'restitution') return 'Signature IT — restitution';
  if (sig.pdfType === 'mise_disposition') return 'Signature IT — remise';
  if (sig.pdfType === 'pv_cloture') return 'Signature IT — PV de non-restitution';
  return 'Signature IT';
}

/** « Signé par Léa Martin, au guichet, en présence de julie.moreau@… » (R-032). */
function signedBy(sig: FicheSignature, collaborateurName: string): string {
  if (sig.type === 'it_cachet') return `par ${sig.signerEmail ?? 'l’équipe informatique'}`;
  if (!sig.isInPerson) return `par ${collaborateurName} (${sig.signerEmail ?? 'lien email'})`;
  return sig.signedByProxy && sig.signerEmail
    ? `par ${collaborateurName}, au guichet, en présence de ${sig.signerEmail}`
    : `par ${collaborateurName}, au guichet`;
}

/**
 * Signatures du bon, dans l'ordre où elles ont eu lieu. Un lien encore en
 * attente n'apparaît pas ici : son état est dans le panneau « À faire
 * maintenant ». Un lien invalidé y figure avec son motif.
 */
export function BonSignatures({ signatures, collaborateurName }: BonSignaturesProps) {
  const signed = signatures.filter((s) => s.signed);
  const invalidated = signatures.filter((s) => !s.signed && s.invalidatedReason && s.type !== 'it_cachet');
  const entries = [...signed, ...invalidated].sort(
    (a, b) => time(a.signedAt ?? a.invalidatedAt ?? a.createdAt) - time(b.signedAt ?? b.invalidatedAt ?? b.createdAt),
  );
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Signatures</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {entries.map((sig) => sig.signed ? (
          <div key={sig.id} className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/10 p-3">
            {sig.type === 'it_cachet'
              ? <Stamp className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-foreground">{sig.type === 'it_cachet' ? itTitle(sig) : sigTypeLabel(sig.type)}</p>
              <p className="break-words text-xs text-muted-foreground">
                Signé le {formatDateTime(sig.signedAt)} {signedBy(sig, collaborateurName)}
                {sig.invalidatedAt && sig.type === 'it_cachet' && ' — remplacée depuis (bon modifié)'}
              </p>
              {sig.type !== 'it_cachet' && sig.mentionLuApprouve && <p className="text-xs text-success">Lu et approuvé</p>}
            </div>
          </div>
        ) : (
          <div key={sig.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-muted-foreground">Lien de signature ({sigTypeLabel(sig.type)}) invalidé</p>
              <p className="text-xs text-muted-foreground">
                Le {formatDateTime(sig.invalidatedAt)} — {labelOrKey(LINK_INVALIDATION_LABELS, sig.invalidatedReason ?? '')}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
