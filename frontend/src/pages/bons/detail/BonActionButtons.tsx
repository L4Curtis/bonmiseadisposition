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
  onCancel,
}: BonActionButtonsProps) {
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
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              onClick={onDeclareNotReturned}
              disabled={!!actionLoading}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Non rendu
            </Button>
          )}
        </>
      )}

      {isItStaff && hasNotReturnedEquipment && (
        <Button
          variant="outline"
          size="sm"
          className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 border-green-200 dark:border-green-800"
          onClick={onMarkFound}
          disabled={!!actionLoading}
        >
          <PackageCheck className="h-3.5 w-3.5" /> Équipement retrouvé
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

      {isCancellable && (
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          onClick={onCancel}
        >
          <XCircle className="h-3.5 w-3.5" /> Annuler
        </Button>
      )}
    </div>
  );
}
