import { useState } from 'react';
import { AlertTriangle, Ban, FileX, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { ReasonAction } from './actions/bon-dialog';
import { BON_ACTION_LABELS } from './bon-lexicon';
import { PHONE_FULLSCREEN_DIALOG, TOUCH_BUTTON, TOUCH_FOOTER } from './dialog-layout';

interface ReasonModalProps {
  readonly action: ReasonAction;
  /** Le motif est facultatif pour abandonner un brouillon. */
  readonly reasonRequired: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
  readonly loading: boolean;
}

const MIN_REASON_LENGTH = 10;

const COPY: Readonly<Record<ReasonAction, { title: string; body: string; placeholder: string; Icon: typeof Ban }>> = {
  cancel: {
    title: 'Annuler ce bon ?',
    body: 'Le bon passera « Annulé » ; c’est définitif. Le lien de signature en attente ne fonctionnera plus. Si un lien avait été envoyé, le collaborateur recevra un email avec votre motif.',
    placeholder: 'Ex. : recrutement annulé, matériel finalement non remis.',
    Icon: Ban,
  },
  handover_without_signature: {
    title: 'Constater la remise sans signature ?',
    body: 'Le matériel a bien été remis, mais le collaborateur ne signera pas. Le bon passera « En cours ». La mention et votre motif figureront sur le document ; le collaborateur en est informé par email.',
    placeholder: 'Ex. : matériel remis en main propre, collaborateur injoignable après trois relances.',
    Icon: UserCheck,
  },
  close_without_signature: {
    title: 'Clôturer sans signature ?',
    body: 'La restitution (ou le PV de non-restitution) ne sera pas signée par le collaborateur. Le bon passera « Clôturé ». La mention et votre motif figureront sur le document ; le collaborateur en est informé par email.',
    placeholder: 'Ex. : collaborateur parti le 30/05, injoignable après trois relances.',
    Icon: FileX,
  },
};

/** Confirmation d'un geste tracé, avec son motif (annulation, remise
 *  constatée ou clôture sans signature). Action dangereuse : bouton rouge. */
export function ReasonModal({ action, reasonRequired, onConfirm, onCancel, loading }: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const { title, body, placeholder, Icon } = COPY[action];
  const trimmed = reason.trim();
  const valid = reasonRequired ? trimmed.length >= MIN_REASON_LENGTH : trimmed.length === 0 || trimmed.length >= MIN_REASON_LENGTH;
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className={`sm:max-w-md ${PHONE_FULLSCREEN_DIALOG}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" /> {title}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason-modal-text">{reasonRequired ? 'Motif (obligatoire)' : 'Motif (facultatif)'}</Label>
          <textarea
            id="reason-modal-text"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            rows={3}
            placeholder={placeholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />
          {trimmed.length > 0 && trimmed.length < MIN_REASON_LENGTH && (
            <p className="text-xs text-warning">Le motif doit faire au moins {MIN_REASON_LENGTH} caractères.</p>
          )}
        </div>
        <DialogFooter className={TOUCH_FOOTER}>
          <Button variant="outline" size="sm" className={TOUCH_BUTTON} onClick={onCancel} disabled={loading}>Retour</Button>
          <Button size="sm" variant="destructive" className={TOUCH_BUTTON} onClick={() => onConfirm(trimmed)} disabled={loading || !valid}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {loading ? 'En cours…' : BON_ACTION_LABELS[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
