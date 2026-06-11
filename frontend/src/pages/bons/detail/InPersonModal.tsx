import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Génération du QR code (annoncé par le texte de la modale — il manquait)
  useEffect(() => {
    QRCode.toDataURL(signerUrl, { width: 480, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [signerUrl]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(signerUrl);
    toast({ title: 'Lien copié', description: 'Le lien de signature a été copié dans le presse-papier.' });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <DialogTitle>Signature présentielle</DialogTitle>
          </div>
          <DialogDescription>
            Demandez au collaborateur de scanner ce QR code ou ouvrez le lien sur votre écran
            pour qu&apos;il signe la {typLabel}. Le lien reste récupérable depuis la fiche du bon.
          </DialogDescription>
        </DialogHeader>

        {/* QR code */}
        <div className="flex justify-center">
          {qrDataUrl ? (
            <div className="rounded-2xl bg-white p-3 ring-1 ring-border shadow-card">
              <img
                src={qrDataUrl}
                alt={`QR code du lien de signature ${typLabel}`}
                className="h-48 w-48"
              />
            </div>
          ) : (
            <div className="h-48 w-48 rounded-2xl bg-muted animate-pulse" />
          )}
        </div>

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
