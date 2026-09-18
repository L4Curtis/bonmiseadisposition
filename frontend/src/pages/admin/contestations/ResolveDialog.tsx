import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { Contestation } from './types';

export function ResolveDialog({
  contestation,
  open,
  onOpenChange,
  onSuccess,
}: {
  contestation: Contestation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState<'resolved' | 'rejected'>('resolved');
  const [resolutionMessage, setResolutionMessage] = useState('');
  const [correct, setCorrect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleClose = (v: boolean) => {
    if (!v) { setResolutionMessage(''); setError(''); setAction('resolved'); setCorrect(false); }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!contestation) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.patch<{ correctedBon?: { id: string; reference: string } | null }>(
        `/contestations/${contestation.id}/resolve`,
        {
          action,
          resolutionMessage: resolutionMessage.trim() || undefined,
          correct: action === 'resolved' ? correct : undefined,
        },
      );
      handleClose(false);
      toast({
        title: action === 'resolved' ? 'Contestation acceptée' : 'Contestation rejetée',
        description: result.correctedBon
          ? `Bon annulé — brouillon corrigé ${result.correctedBon.reference} créé.`
          : `La contestation de ${contestation.user.displayName} a été traitée.`,
        variant: action === 'resolved' ? 'success' : 'default',
      });
      onSuccess();
      // Ouvrir directement le brouillon corrigé pour édition puis re-signature
      if (result.correctedBon) {
        navigate(`/bons/${result.correctedBon.id}/edit`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors du traitement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Traiter la contestation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 border p-3 text-sm">
            <p className="text-muted-foreground text-xs mb-1">Motif du collaborateur ({contestation?.user.displayName})</p>
            <p className="text-foreground/80">{contestation?.message}</p>
          </div>

          <div className="space-y-2">
            <Label>Décision</Label>
            <div className="flex gap-3">
              <button
                onClick={() => setAction('resolved')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${action === 'resolved' ? 'border-success/40 bg-success/10 text-success' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
              >
                <CheckCircle className="h-4 w-4" /> Accepter
              </button>
              <button
                onClick={() => setAction('rejected')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${action === 'rejected' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
              >
                <XCircle className="h-4 w-4" /> Rejeter
              </button>
            </div>
          </div>

          {action === 'resolved' && (
            <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-warning/30 bg-warning/5 p-3">
              <input
                type="checkbox"
                checked={correct}
                onChange={(e) => setCorrect(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-warning focus:ring-ring"
              />
              <span className="text-sm text-foreground/80">
                <strong>Corriger et re-signer</strong> — le bon contesté sera annulé et un
                brouillon pré-rempli sera créé pour correction puis nouvelle signature.
                Sans cette option, le bon revient simplement à son état antérieur.
              </span>
            </label>
          )}

          <div className="space-y-2">
            <Label htmlFor="resolution-msg">Réponse au collaborateur (optionnel)</Label>
            <textarea
              id="resolution-msg"
              className="w-full rounded-lg border bg-background text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder="Expliquez votre décision..."
              value={resolutionMessage}
              onChange={(e) => setResolutionMessage(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleClose(false)}>Annuler</Button>
          <Button
            size="sm"
            className={action === 'resolved' ? 'bg-success hover:bg-success/90 text-success-foreground' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Envoi...' : action === 'resolved' ? 'Accepter la contestation' : 'Rejeter la contestation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
