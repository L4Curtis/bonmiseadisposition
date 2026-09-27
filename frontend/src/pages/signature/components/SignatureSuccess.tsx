import { CheckCircle } from 'lucide-react';
import type { LinkSignatureType } from '@/contracts/bons';
import { PortalLink, StatusScreen } from './StatusScreen';
import { signatureDocLabel, signatureStageForType } from '../lib/signatureLabels';
import type { BonInfo } from '../types';

interface FreshlySignedScreenProps {
  bon: BonInfo;
  type: LinkSignatureType;
  /** Lien au guichet (présentiel). */
  inPerson: boolean;
  /** Signée au guichet par une personne mandatée (autre compte que le
   *  titulaire, hors équipe informatique). */
  signedByProxy: boolean;
  /** Signée au guichet par le titulaire sur l'appareil d'un compte IT. */
  witnessedByIt: boolean;
  /** Personne connectée : le témoin (IT) ou le mandataire. */
  witnessName: string;
  downloadError: string | null;
  onDownloadSigned: (bonId: string, stage?: string) => void;
}

/** Phrase de fin : qui a signé, où, en présence de qui (R-059). */
export function signedMessage(
  props: Pick<FreshlySignedScreenProps, 'bon' | 'type' | 'inPerson' | 'signedByProxy' | 'witnessedByIt' | 'witnessName'>,
): string {
  const document = `${signatureDocLabel(props.type)} (réf. ${props.bon.reference})`;
  if (props.signedByProxy) {
    return `${document} a été signé au guichet par ${props.witnessName}, au nom de ${props.bon.collaborateur.displayName}.`;
  }
  if (props.witnessedByIt) {
    return `${document} a été signé par ${props.bon.collaborateur.displayName}, au guichet, en présence de ${props.witnessName}.`;
  }
  if (props.inPerson) return `${document} a bien été signé au guichet.`;
  const confirmation = props.bon.collaborateurEmail ? ' Un email de confirmation vous est envoyé.' : '';
  return `${document} a bien été signé électroniquement.${confirmation}`;
}

/** Signature qui vient d'être soumise : téléchargement immédiat du document
 *  signé, puis retour au portail (ou à la fiche du bon pour le technicien). */
export function FreshlySignedScreen(props: FreshlySignedScreenProps) {
  const { bon, type, witnessedByIt, downloadError, onDownloadSigned } = props;
  const stage = signatureStageForType(type);
  return (
    <StatusScreen
      icon={<CheckCircle className="h-12 w-12 text-success" />}
      title="Document signé"
      message={signedMessage(props)}
      success
      actions={
        <div className="flex flex-col gap-2 w-full">
          <button
            type="button"
            onClick={() => onDownloadSigned(bon.id, stage)}
            className="btn-gradient w-full min-h-11 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Télécharger le document signé
          </button>
          {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}
          {/* Le technicien qui a tendu son appareil retourne à la fiche du bon. */}
          {witnessedByIt ? (
            <a
              href={`/bons/${bon.id}`}
              className="w-full min-h-11 inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
            >
              Retour à la fiche du bon
            </a>
          ) : (
            <PortalLink />
          )}
        </div>
      }
    />
  );
}

interface AlreadySignedScreenProps {
  reference: string;
  bonId: string;
  downloadError: string | null;
  onDownloadSigned: (bonId: string) => void;
}

/** Lien déjà utilisé. */
export function AlreadySignedScreen({ reference, bonId, downloadError, onDownloadSigned }: AlreadySignedScreenProps) {
  return (
    <StatusScreen
      icon={<CheckCircle className="h-12 w-12 text-success" />}
      title="Document déjà signé"
      message="Ce document a déjà été signé : il n'y a plus rien à faire avec ce lien."
      reference={reference}
      success
      actions={
        <div className="flex flex-col gap-2 w-full">
          <PortalLink primary />
          <button
            type="button"
            onClick={() => onDownloadSigned(bonId)}
            className="w-full min-h-11 rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
          >
            Télécharger le document
          </button>
          {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}
        </div>
      }
    />
  );
}
