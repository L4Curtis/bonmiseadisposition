import { useState } from 'react';
import { AlertOctagon } from 'lucide-react';
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
import { contestationSchema, validate } from '@/lib/validation';

interface ContestationDialogProps {
  bonId: string | null;
  bonRef?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ContestationDialog({
  bonId,
  bonRef,
  open,
  onOpenChange,
  onSuccess,
}: ContestationDialogProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClose = (v: boolean) => {
    if (!v) { setMessage(''); setError(''); }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!bonId) return;
    const result = validate(contestationSchema, { message: message.trim() });
    if (!result.success) { setError(Object.values(result.errors)[0]); return; }
    setLoading(true);
    setError('');
    try {
      await api.post(`/bons/${bonId}/contestation`, { message: message.trim() });
      handleClose(false);
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la contestation';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-destructive" />
            Contester le bon {bonRef}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Décrivez le motif de votre contestation. Le service IT sera notifié et vous répondra dans les meilleurs délais.
          </p>
          <div className="space-y-2">
            <Label htmlFor="contestation-msg">Motif de contestation</Label>
            <textarea
              id="contestation-msg"
              className="w-full rounded-lg border bg-background text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={5}
              placeholder="Ex: Les équipements listés ne correspondent pas à ce que j'ai reçu..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
          </div>
          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Annuler</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Envoi...' : 'Envoyer la contestation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
