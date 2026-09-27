import { AlertTriangle } from 'lucide-react';
import type { SendChecksResponse } from '@/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { SendConfirmations } from './bon-api';
import { PHONE_FULLSCREEN_DIALOG, TOUCH_BUTTON, TOUCH_FOOTER } from './dialog-layout';

interface SendChecksModalProps {
  readonly checks: SendChecksResponse;
  readonly onConfirm: (confirmations: SendConfirmations) => void;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
}

/**
 * Avant la signature IT d'une remise (R-003) : lignes qu'aucun numéro
 * n'identifie, numéros de série déjà prêtés sur un autre bon en cours.
 * L'IT corrige le bon, ou poursuit en connaissance de cause — ce choix est
 * tracé dans le journal d'audit.
 */
export function SendChecksModal({ checks, onConfirm, onEdit, onCancel }: SendChecksModalProps) {
  const missing = checks.missingSerials;
  const conflicts = checks.serialConflicts;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className={`sm:max-w-lg ${PHONE_FULLSCREEN_DIALOG}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> À vérifier avant la remise
          </DialogTitle>
          <DialogDescription>
            Corrigez le bon si possible. Si vous poursuivez, ce choix est enregistré dans le journal d’audit.
          </DialogDescription>
        </DialogHeader>
        {missing.length > 0 && (
          <section className="space-y-1 text-sm">
            <h3 className="font-medium text-foreground">
              {missing.length === 1 ? 'Une ligne sans numéro de série ni d’inventaire' : `${missing.length} lignes sans numéro de série ni d’inventaire`}
            </h3>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {missing.map((line) => <li key={line.equipmentId}>Ligne {line.position} : {line.label}</li>)}
            </ul>
          </section>
        )}
        {conflicts.length > 0 && (
          <section className="space-y-1 text-sm">
            <h3 className="font-medium text-foreground">Numéros de série déjà prêtés sur un autre bon en cours</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {conflicts.map((c, i) => (
                <li key={`${c.serialNumber}-${i}`}><span className="font-mono">{c.serialNumber}</span> — {c.bonReference}</li>
              ))}
            </ul>
          </section>
        )}
        <DialogFooter className={TOUCH_FOOTER}>
          <Button variant="outline" size="sm" className={TOUCH_BUTTON} onClick={onCancel}>Annuler</Button>
          <Button variant="outline" size="sm" className={TOUCH_BUTTON} onClick={onEdit}>Corriger le bon</Button>
          <Button
            size="sm"
            className={`${TOUCH_BUTTON} bg-warning text-warning-foreground hover:bg-warning/90`}
            onClick={() => onConfirm({
              confirmMissingSerials: missing.length > 0,
              confirmSerialConflicts: conflicts.length > 0,
            })}
          >
            Poursuivre quand même
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
