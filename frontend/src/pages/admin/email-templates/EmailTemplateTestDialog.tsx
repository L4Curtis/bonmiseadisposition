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
import { BonPicker } from './BonPicker';
import { NON_BON_CATEGORIES } from './types';
import type { PreviewBonOption, TemplateDefinition } from './types';

interface EmailTemplateTestDialogProps {
  template: TemplateDefinition | null;
  open: boolean;
  onClose: () => void;
}

interface TestEmailResult {
  success: boolean;
  message: string;
}

/** Envoi d'un email de test pour un modèle, sans créer ni modifier de bon.
 *  Par défaut le modèle est rendu avec un jeu de variables d'exemple
 *  (POST /admin/email-templates/:id/test) ; l'administrateur peut choisir un
 *  vrai bon (lot H3, POST /admin/email-templates/:id/test-bon) : ses données
 *  sont alors reprises, avec un lien de signature factice. Chaque envoi est
 *  tracé dans le journal d'audit. L'adresse de l'administrateur connecté est
 *  proposée par défaut. */
export function EmailTemplateTestDialog({ template, open, onClose }: EmailTemplateTestDialogProps) {
  const { user } = useAuth();
  const userEmail = user?.email ?? '';
  const [email, setEmail] = useState('');
  const [useBon, setUseBon] = useState(false);
  const [bon, setBon] = useState<PreviewBonOption | null>(null);
  const [sending, setSending] = useState(false);

  const bonAllowed = !!template && !NON_BON_CATEGORIES.includes(template.category);

  // Dépend de l'adresse (chaîne) et non de l'objet `user`, qui peut changer
  // d'identité à chaque rendu : la saisie en cours ne doit pas être réinitialisée.
  useEffect(() => {
    if (open) {
      setEmail(userEmail);
      setUseBon(false);
      setBon(null);
    }
  }, [open, userEmail]);

  const bonMissing = useBon && !bon;

  const handleSend = async () => {
    if (!template || !email.trim() || bonMissing) return;
    setSending(true);
    try {
      const result = useBon && bon
        ? await api.post<TestEmailResult>(
          `/admin/email-templates/${template.id}/test-bon`,
          { email: email.trim(), bonId: bon.id },
        )
        : await api.post<TestEmailResult>(
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
            Le modèle <strong>{template?.name}</strong> sera envoyé à l'adresse indiquée
            {useBon
              ? " avec les données du bon choisi (lien de signature factice), sans le modifier."
              : " avec des données d'exemple représentatives, sans créer ni modifier de bon."}
            {' '}L'envoi est tracé dans le journal d'audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          {bonAllowed && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useBon}
                  onChange={(e) => { setUseBon(e.target.checked); if (!e.target.checked) setBon(null); }}
                  className="h-4 w-4 accent-primary"
                />
                Utiliser les données d'un vrai bon
              </label>
              {useBon && <BonPicker idPrefix="email-test" selected={bon} onSelect={setBon} />}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
          <Button onClick={handleSend} disabled={sending || !email.trim() || bonMissing}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Envoyer le test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
