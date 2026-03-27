import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

interface InPersonModalProps {
  type: 'mise_disposition' | 'restitution';
  token: string;
  onClose: () => void;
}

export function InPersonModal({ type, token, onClose }: InPersonModalProps) {
  const signerUrl = `${window.location.origin}/signer/${token}`;
  const typLabel = type === 'restitution' ? 'restitution' : 'mise à disposition';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(signerUrl);
    toast({ title: 'Lien copié', description: 'Le lien de signature a été copié dans le presse-papier.' });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-blue-600" />
            <DialogTitle>Signature présentielle</DialogTitle>
          </div>
          <DialogDescription>
            Demandez au collaborateur de scanner ce QR code ou ouvrez le lien sur votre écran
            pour qu&apos;il signe la {typLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/40 rounded-lg p-3 break-all text-xs font-mono text-muted-foreground border">
          {signerUrl}
        </div>

        <DialogFooter className="flex-row gap-2 sm:flex-row">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleCopyLink}>
            Copier le lien
          </Button>
          <Button size="sm" className="flex-1" onClick={() => window.open(signerUrl, '_blank')}>
            Ouvrir
          </Button>
        </DialogFooter>

        <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
          Fermer
        </Button>
      </DialogContent>
    </Dialog>
  );
}
