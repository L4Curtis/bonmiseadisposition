import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Download,
  Send,
  XCircle,
  Pencil,
  Loader2,
  RotateCcw,
  Smartphone,
  AlertTriangle,
  PackageCheck,
  FileX,
  Stamp,
  Copy,
} from 'lucide-react';
import type { BonDetailData } from './types';

export interface BonActionButtonsProps {
  readonly bon: BonDetailData;
  readonly isDraft: boolean;
  readonly canInitiateRestitution: boolean;
  readonly isCancellable: boolean;
  readonly isItStaff: boolean;
  readonly isSentWaiting: boolean;
  readonly hasPendingPvCloture: boolean;
  readonly hasNotReturnedEquipment: boolean;
  readonly canCloseUnilateral: boolean;
  /** Une signature présentielle est en attente : proposer de réafficher le lien/QR. */
  readonly hasPendingInPerson: boolean;
  readonly onShowInPerson: () => void;
  /** Rattrapage : la restitution a été actée mais le cachet IT correspondant
   *  n'a jamais été posé (modale fermée sans signer). */
  readonly needsRestitutionItCachet: boolean;
  readonly onApplyRestitutionItCachet: () => void;
  readonly actionLoading: string | null;
  readonly pdfLoading: string | null;
  readonly onDownloadPdf: () => void;
  readonly onEdit: () => void;
  readonly onSend: () => void;
  readonly onInPersonMise: () => void;
  readonly onInitiateRestitution: () => void;
  readonly onInPersonRestitution: () => void;
  readonly onDeclareNotReturned: () => void;
  readonly onMarkFound: () => void;
  readonly onResend: () => void;
  readonly onCloseUnilateral: () => void;
  readonly onCancel: () => void;
}

export function BonActionButtons({
  bon,
  isDraft,
  canInitiateRestitution,
  isCancellable,
  isItStaff,
  isSentWaiting,
  hasPendingPvCloture,
  hasNotReturnedEquipment,
  canCloseUnilateral,
  hasPendingInPerson,
  onShowInPerson,
  needsRestitutionItCachet,
  onApplyRestitutionItCachet,
  actionLoading,
  pdfLoading,
  onDownloadPdf,
  onEdit,
  onSend,
  onInPersonMise,
  onInitiateRestitution,
  onInPersonRestitution,
  onDeclareNotReturned,
  onMarkFound,
  onResend,
  onCloseUnilateral,
  onCancel,
}: BonActionButtonsProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Bouton PDF principal */}
      <Button
        variant="outline"
        size="sm"
        onClick={onDownloadPdf}
        disabled={pdfLoading === 'header'}
      >
        {pdfLoading === 'header'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          : <Download className="h-3.5 w-3.5" />}
        PDF
      </Button>

      {/* Repartir de ce bon : le cas courant du kit standard remis à chaque
          arrivée. Le formulaire ne reprend que les articles — ni collaborateur,
          ni dates, ni numéros de série (propres à un exemplaire). */}
      {isItStaff && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/bons/new?duplicateFrom=${bon.id}`)}
          title="Créer un nouveau bon avec les mêmes équipements"
        >
          <Copy className="h-3.5 w-3.5" /> Dupliquer
        </Button>
      )}

      {isDraft && (
        <>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Modifier
          </Button>

          <Button size="sm" onClick={onSend} disabled={!!actionLoading}>
            {actionLoading === 'send'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              : <Send className="h-3.5 w-3.5" />}
            Envoyer
          </Button>

          <Button variant="outline" size="sm" onClick={onInPersonMise} disabled={!!actionLoading}>
            <Smartphone className="h-3.5 w-3.5" /> Présentiel
          </Button>
        </>
      )}

      {canInitiateRestitution && (
        <>
          <Button size="sm" variant="outline" onClick={onInitiateRestitution} disabled={!!actionLoading}>
            <RotateCcw className="h-3.5 w-3.5" /> Initier restitution
          </Button>

          <Button variant="outline" size="sm" onClick={onInPersonRestitution} disabled={!!actionLoading}>
            <Smartphone className="h-3.5 w-3.5" /> Restitution présentielle
          </Button>

          {isItStaff && bon.equipments.some((eq) => !eq.returnedAt && !eq.notReturned) && (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDeclareNotReturned}
              disabled={!!actionLoading}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Non rendu
            </Button>
          )}
        </>
      )}

      {isItStaff && needsRestitutionItCachet && (
        <Button
          variant="outline"
          size="sm"
          onClick={onApplyRestitutionItCachet}
          disabled={!!actionLoading}
          title="La restitution a été enregistrée sans que le cachet IT correspondant ait été posé — l'apposer maintenant"
        >
          <Stamp className="h-3.5 w-3.5" /> Apposer le cachet IT (restitution)
        </Button>
      )}

      {isItStaff && hasNotReturnedEquipment && (
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkFound}
          disabled={!!actionLoading}
        >
          <PackageCheck className="h-3.5 w-3.5" /> Équipement retrouvé
        </Button>
      )}

      {isItStaff && hasPendingInPerson && (
        <Button
          variant="outline"
          size="sm"
          onClick={onShowInPerson}
          disabled={!!actionLoading}
          title="Réaffiche le QR code et le lien de signature présentielle (un nouveau lien est généré, l'ancien est invalidé)"
        >
          {actionLoading === 'inperson'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            : <Smartphone className="h-3.5 w-3.5" />}
          Afficher le lien présentiel
        </Button>
      )}

      {(isSentWaiting || hasPendingPvCloture) && isItStaff && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResend}
          disabled={!!actionLoading}
          title={hasPendingPvCloture ? 'Renvoie le PV au collaborateur pour signature' : 'Régénère un nouveau token et renvoie l\'email de signature au collaborateur'}
        >
          {actionLoading === 'resend'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            : <Send className="h-3.5 w-3.5" />}
          {hasPendingPvCloture ? 'Renvoyer le PV' : 'Renvoyer le lien'}
        </Button>
      )}

      {isItStaff && canCloseUnilateral && (
        <Button
          variant="outline"
          size="sm"
          onClick={onCloseUnilateral}
          disabled={!!actionLoading}
          title="Clore ce bon sans signature du collaborateur (départ, silence prolongé) — motif obligatoire, tracé dans l'audit"
        >
          <FileX className="h-3.5 w-3.5" /> Clôturer sans signature
        </Button>
      )}

      {isCancellable && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onCancel}
        >
          <XCircle className="h-3.5 w-3.5" /> Annuler
        </Button>
      )}
    </div>
  );
}
