import { CheckCircle } from 'lucide-react';
import { StatusScreen } from './StatusScreen';
import { signatureDocLabel, signatureStageForType } from '../lib/signatureLabels';
import type { SignatureResponse } from '../types';

interface FreshlySignedScreenProps {
  bon: NonNullable<SignatureResponse['bon']>;
  signature: NonNullable<SignatureResponse['signature']>;
  isProxySigned: boolean;
  downloadError: string | null;
  onDownloadSigned: (bonId: string, stage?: string) => void;
}

/** Signature fraîchement soumise (data contient encore le payload pending
 *  complet) — permet un téléchargement immédiat du snapshot généré de façon
 *  synchrone à la signature. */
export function FreshlySignedScreen({ bon, signature, isProxySigned, downloadError, onDownloadSigned }: FreshlySignedScreenProps) {
  const docLabel = signatureDocLabel(signature.type);
  const stage = signatureStageForType(signature.type);
  const bonId = bon.id;
  return (
    <StatusScreen
      icon={<CheckCircle className="h-12 w-12 text-success" />}
      title="Document signé ✓"
      message={`${docLabel} (réf. ${bon.reference}) a bien été signé électroniquement. Un email de confirmation vous sera envoyé.`}
      success
      actions={
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={() => onDownloadSigned(bonId, stage)}
            className="btn-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Télécharger le document signé
          </button>
          {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}
          {isProxySigned ? (
            <a href={`/bons/${bonId}`} className="text-sm text-primary hover:underline">Retour à la fiche du bon</a>
          ) : (
            <a href="/mes-bons" className="text-sm text-primary hover:underline">Accéder à mes bons</a>
          )}
        </div>
      }
    />
  );
}

interface AlreadySignedScreenProps {
  reference?: string;
  bonId?: string;
  downloadError: string | null;
  onDownloadSigned: (bonId: string) => void;
}

/** Lien déjà signé précédemment. Payload minimal aujourd'hui (référence
 *  seule) ; le lot B doit y ajouter `bonId` pour permettre un vrai
 *  téléchargement — tant qu'il est absent, on renvoie vers le portail. */
export function AlreadySignedScreen({ reference, bonId, downloadError, onDownloadSigned }: AlreadySignedScreenProps) {
  return (
    <StatusScreen
      icon={<CheckCircle className="h-12 w-12 text-success" />}
      title="Document déjà signé ✓"
      message={`Ce document${reference ? ` (réf. ${reference})` : ''} a déjà été signé électroniquement.`}
      success
      actions={
        <div className="flex flex-col gap-2 w-full">
          <a href="/mes-bons" className="btn-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground text-center">
            Accéder à mes bons
          </a>
          {bonId ? (
            <button
              type="button"
              onClick={() => onDownloadSigned(bonId)}
              className="text-sm text-primary hover:underline"
            >
              Télécharger le document
            </button>
          ) : (
            <a href="/mes-bons" className="text-sm text-primary hover:underline">Télécharger le document</a>
          )}
          {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}
        </div>
      }
    />
  );
}
