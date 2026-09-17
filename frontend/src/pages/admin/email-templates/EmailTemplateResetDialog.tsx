import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { TemplateDefinition } from './types';

interface EmailTemplateResetDialogProps {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
  onReset: () => void;
}

export function EmailTemplateResetDialog({
  template, open, onClose, onReset,
}: EmailTemplateResetDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!template) return;
    setLoading(true);
    try {
      await api.delete(`/admin/email-templates/${template.id}`);
      toast({ title: 'Template reinitialise' });
      onReset();
      onClose();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de reinitialiser.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reinitialiser le template</DialogTitle>
          <DialogDescription>
            Le template <strong>{template?.name}</strong> sera remplace par sa version par defaut. Cette action est irreversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
          <Button variant="destructive" onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Reinitialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
