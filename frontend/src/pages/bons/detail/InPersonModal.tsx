import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Maximize2, Smartphone } from 'lucide-react';
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

/** Taille de l'image générée (px) : assez grande pour un affichage plein écran net. */
const QR_IMAGE_SIZE = 1024;
/** Marge blanche autour du code, en modules (valeur normalisée ISO 18004). */
const QR_QUIET_ZONE = 4;

interface InPersonModalProps {
  type: 'mise_disposition' | 'restitution';
  token: string;
  onClose: () => void;
}

export function InPersonModal({ type, token, onClose }: InPersonModalProps) {
  const signerUrl = `${window.location.origin}/signer/${token}`;
  const typLabel = type === 'restitution' ? 'restitution' : 'mise à disposition';
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);

  // Génération du QR code (annoncé par le texte de la modale — il manquait).
  // Image générée en haute définition pour rester nette en plein écran, avec
  // la marge blanche normalisée de 4 modules : sans elle, un téléphone tenu à
  // distance d'un écran sombre peine à détecter les bords du code.
  useEffect(() => {
    QRCode.toDataURL(signerUrl, { width: QR_IMAGE_SIZE, margin: QR_QUIET_ZONE, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [signerUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(signerUrl);
      toast({ title: 'Lien copié', description: 'Le lien de signature a été copié dans le presse-papier.' });
    } catch {
      toast({
        title: 'Copie impossible',
        description: 'Sélectionnez le lien manuellement pour le copier.',
        variant: 'destructive',
      });
    }
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
        <div className="flex flex-col items-center gap-2">
          {qrDataUrl ? (
            <div className="rounded-2xl bg-white p-1 ring-1 ring-border shadow-card">
              <img
                src={qrDataUrl}
                alt={`QR code du lien de signature ${typLabel}`}
                className="h-56 w-56"
              />
            </div>
          ) : (
            <div className="h-56 w-56 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEnlarged(true)}
            disabled={!qrDataUrl}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" /> Afficher en grand
          </Button>
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

        {/* Rendue DANS la modale parente : Radix empile alors les deux
            couches, Échap ou un clic à côté ne ferment que la vue agrandie. */}
        {enlarged && qrDataUrl && (
          <EnlargedQrDialog qrDataUrl={qrDataUrl} typLabel={typLabel} onClose={() => setEnlarged(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EnlargedQrDialogProps {
  qrDataUrl: string;
  typLabel: string;
  onClose: () => void;
}

/** QR code sur presque tout l'écran, sur fond blanc quel que soit le thème :
 *  le collaborateur le scanne depuis sa place, écran du poste tourné vers lui. */
function EnlargedQrDialog({ qrDataUrl, typLabel, onClose }: EnlargedQrDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-none w-[min(96vw,calc(96vh-4rem))] justify-items-center gap-3 border-none bg-white p-4 text-neutral-900 sm:p-6">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-neutral-900">Scannez pour signer la {typLabel}</DialogTitle>
          <DialogDescription className="text-neutral-600">
            Ouvrez l&apos;appareil photo du téléphone et visez ce code.
          </DialogDescription>
        </DialogHeader>
        <img
          src={qrDataUrl}
          alt={`QR code du lien de signature ${typLabel}, en grand`}
          className="aspect-square w-full max-h-[calc(96vh-12rem)] object-contain [image-rendering:pixelated]"
        />
        <Button variant="outline" onClick={onClose} className="border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100">
          Réduire
        </Button>
      </DialogContent>
    </Dialog>
  );
}
