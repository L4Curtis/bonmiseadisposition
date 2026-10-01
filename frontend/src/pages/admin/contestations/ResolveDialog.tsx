import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { ContestationOutcome } from '@/contracts/common';
import type { ContestationListItem, ResolveContestationResponse } from '@/contracts/contestations';
import { CONTESTATION_OUTCOME_LABELS } from '@/domain/labels';
import { api, hasErrorCode } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { contestedDocumentLabel, foundedEffect, foundedOutcomeMessage } from './contestation-meta';

interface ResolveDialogProps {
  contestation: ContestationListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface OutcomeOption {
  value: ContestationOutcome;
  icon: typeof CheckCircle;
  effect: string;
  tone: string;
}

/** Les deux issues, avec ce que chacune entraîne pour CE document. */
function outcomeOptions(contestation: ContestationListItem | null): readonly OutcomeOption[] {
  return [
    {
      value: 'founded',
      icon: CheckCircle,
      effect: foundedEffect({ contestedDocument: contestation?.contestedDocument ?? null }),
      tone: 'border-success/50 bg-success/10 text-success',
    },
    {
      value: 'not_retained',
      icon: XCircle,
      effect: 'Rien ne change : le bon reprend son état d’avant la contestation. Expliquez pourquoi au collaborateur.',
      tone: 'border-destructive/50 bg-destructive/10 text-destructive',
    },
  ];
}

/** Après une décision Fondée : ouvrir le bon à corriger — le remplaçant (à
 *  compléter puis envoyer s'il est encore en brouillon), ou le bon d'origine
 *  rouvert pour correction. */
function correctionPath(result: ResolveContestationResponse): string | null {
  const replacement = result.replacementBon;
  if (replacement) return replacement.status === 'draft' ? `/bons/${replacement.id}/edit` : `/bons/${replacement.id}`;
  return result.reopenedDocument ? `/bons/${result.bon.id}` : null;
}

/** « Trancher la contestation » : deux issues seulement, Fondée ou Non
 *  retenue (décision du 24/09), le motif du collaborateur sous les yeux. */
export function ResolveDialog({ contestation, open, onOpenChange, onSuccess }: ResolveDialogProps) {
  const [outcome, setOutcome] = useState<ContestationOutcome | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const messageRequired = outcome === 'not_retained';
  const canSubmit = !!outcome && (!messageRequired || message.trim().length > 0) && !loading;

  const handleClose = (v: boolean) => {
    if (!v) {
      setOutcome(null);
      setMessage('');
      setError('');
    }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!contestation || !outcome) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.post<ResolveContestationResponse>(`/contestations/${contestation.id}/resolve`, {
        outcome,
        resolutionMessage: message.trim() || undefined,
      });
      handleClose(false);
      toast({
        title: `Contestation ${CONTESTATION_OUTCOME_LABELS[outcome].toLowerCase()}`,
        description:
          outcome === 'founded'
            ? foundedOutcomeMessage(contestation.bon.reference, contestation.user.displayName, result)
            : `${contestation.bon.reference} reprend son état. ${contestation.user.displayName} reçoit votre réponse.`,
        variant: 'success',
      });
      onSuccess();
      const path = outcome === 'founded' ? correctionPath(result) : null;
      if (path) navigate(path);
    } catch (e: unknown) {
      if (hasErrorCode(e, 'contestation_already_handled')) {
        // Tranchée entre-temps par un collègue : la fenêtre se ferme sur la
        // liste à jour plutôt que de garder une décision devenue impossible.
        handleClose(false);
        toast({ title: 'Contestation déjà tranchée', description: e.message });
        onSuccess();
        return;
      }
      setError(errorMessage(e, 'Erreur lors de la décision'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trancher la contestation</DialogTitle>
          <DialogDescription>
            {contestation?.bon.reference} — {contestation ? contestedDocumentLabel(contestation) : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 border p-3 text-sm">
            <p className="text-muted-foreground text-xs mb-1">Motif de {contestation?.user.displayName}</p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{contestation?.message}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-2">Décision</legend>
            {outcomeOptions(contestation).map(({ value, icon: Icon, effect, tone }) => (
              <label
                key={value}
                htmlFor={`outcome-${value}`}
                aria-label={CONTESTATION_OUTCOME_LABELS[value]}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  outcome === value ? tone : 'border-border hover:bg-muted/40',
                )}
              >
                <input
                  id={`outcome-${value}`}
                  type="radio"
                  name="outcome"
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                  aria-describedby={`outcome-${value}-effet`}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Icon className="h-4 w-4" /> {CONTESTATION_OUTCOME_LABELS[value]}
                  </span>
                  <span id={`outcome-${value}-effet`} className="block text-sm text-foreground/80">{effect}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="resolution-msg">
              Réponse au collaborateur {messageRequired ? '(obligatoire)' : '(facultative)'}
            </Label>
            <textarea
              id="resolution-msg"
              className="w-full rounded-lg border bg-background text-foreground px-3 py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder="Expliquez votre décision…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => handleClose(false)}>
            Annuler
          </Button>
          <Button className="min-h-11 sm:min-h-9" onClick={handleSubmit} disabled={!canSubmit}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer la décision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
