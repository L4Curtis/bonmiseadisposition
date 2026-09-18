import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface PdfTemplateResetDialogProps {
  templateId: string | null;
  open: boolean;
  onClose: () => void;
  onReset: () => void;
}

export function PdfTemplateResetDialog({
  templateId, open, onClose, onReset,
}: PdfTemplateResetDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      await api.delete(`/admin/pdf-templates/${templateId}`);
      toast({ title: 'Modèle réinitialisé' });
      onReset();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Échec de la réinitialisation', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réinitialiser le modèle</DialogTitle>
          <DialogDescription>
            Toutes les personnalisations seront perdues. Le modèle reviendra à sa configuration par défaut.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Réinitialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
