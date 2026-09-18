import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Loader2, Send } from 'lucide-react';
import type { TemplateDefinition } from './types';

interface EmailTemplateTestDialogProps {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
}

interface TestEmailResult {
  success: boolean;
  message: string;
}

/** Envoi d'un email de test pour un modèle (POST /admin/email-templates/:id/test) :
 *  le modèle est rendu avec un jeu de variables d'exemple et envoyé à l'adresse
 *  indiquée, sans créer ni modifier de bon. L'adresse de l'administrateur
 *  connecté est proposée par défaut. */
export function EmailTemplateTestDialog({ template, open, onClose }: EmailTemplateTestDialogProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setEmail(user?.email ?? '');
  }, [open, user]);

  const handleSend = async () => {
    if (!template || !email.trim()) return;
    setSending(true);
    try {
      const result = await api.post<TestEmailResult>(
        `/admin/email-templates/${template.id}/test`,
        { email: email.trim() },
      );
      toast({
        title: result.success ? 'Email de test envoyé' : "Échec de l'envoi",
        description: result.message,
        variant: result.success ? undefined : 'destructive',
      });
      if (result.success) onClose();
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'envoyer l'email de test.", variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Envoyer un email de test</DialogTitle>
          <DialogDescription>
            Le modèle <strong>{template?.name}</strong> sera envoyé à l'adresse indiquée avec des
            données d'exemple représentatives, sans créer ni modifier de bon.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="email-template-test-address">Adresse email destinataire</Label>
          <Input
            id="email-template-test-address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@livio.fr"
            autoFocus
          />
        </div>

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
          <Button onClick={handleSend} disabled={sending || !email.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Envoyer le test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
