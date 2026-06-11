import type { BonDetailData, PendingItAction } from './types';
import { ConfirmModal } from './ConfirmModal';
import { InPersonModal } from './InPersonModal';
import { ItSignModal } from './ItSignModal';
import { RestitutionModal } from './RestitutionModal';
import { DeclareNotReturnedModal } from './DeclareNotReturnedModal';
import { MarkFoundModal } from './MarkFoundModal';
import { CloseUnilateralModal } from './CloseUnilateralModal';

export interface BonModalsProps {
  readonly bon: BonDetailData;

  // Cancel modal
  readonly confirmCancel: boolean;
  readonly onCancelConfirm: () => Promise<void>;
  readonly onCancelDismiss: () => void;
  readonly cancelLoading: boolean;

  // In-person modal
  readonly inPersonModal: { type: 'mise_disposition' | 'restitution'; token: string } | null;
  readonly onInPersonClose: () => void;

  // IT sign modal
  readonly pendingItAction: PendingItAction | null;
  readonly onItSignClose: () => void;
  readonly onItSigned: () => Promise<void>;

  // Restitution modal
  readonly showRestitutionModal: boolean;
  readonly onRestitutionConfirm: (selectedIds: string[]) => void;
  readonly onRestitutionCancel: () => void;
  readonly restitutionLoading: boolean;

  // Not returned modal
  readonly showNotReturnedModal: boolean;
  readonly onNotReturnedConfirm: (equipmentIds: string[], reason: string, signatureDataUrl: string) => Promise<void>;
  readonly onNotReturnedCancel: () => void;
  readonly notReturnedLoading: boolean;

  // Mark found modal
  readonly showMarkFoundModal: boolean;
  readonly onMarkFoundConfirm: (equipmentIds: string[], signatureDataUrl: string) => Promise<void>;
  readonly onMarkFoundCancel: () => void;
  readonly markFoundLoading: boolean;

  // Resend confirm modal
  readonly resendConfirmSentAt: string | null;
  readonly onResendForce: () => Promise<void>;
  readonly onResendDismiss: () => void;
  readonly resendLoading: boolean;

  // Close unilateral modal
  readonly showCloseUnilateralModal: boolean;
  readonly onCloseUnilateralConfirm: (reason: string) => void;
  readonly onCloseUnilateralCancel: () => void;
  readonly closeUnilateralLoading: boolean;
}

export function BonModals({
  bon,
  confirmCancel,
  onCancelConfirm,
  onCancelDismiss,
  cancelLoading,
  inPersonModal,
  onInPersonClose,
  pendingItAction,
  onItSignClose,
  onItSigned,
  showRestitutionModal,
  onRestitutionConfirm,
  onRestitutionCancel,
  restitutionLoading,
  showNotReturnedModal,
  onNotReturnedConfirm,
  onNotReturnedCancel,
  notReturnedLoading,
  showMarkFoundModal,
  onMarkFoundConfirm,
  onMarkFoundCancel,
  markFoundLoading,
  resendConfirmSentAt,
  onResendForce,
  onResendDismiss,
  resendLoading,
  showCloseUnilateralModal,
  onCloseUnilateralConfirm,
  onCloseUnilateralCancel,
  closeUnilateralLoading,
}: BonModalsProps) {
  return (
    <>
      {/* Modal annulation */}
      {confirmCancel && (
        <ConfirmModal
          title="Annuler ce bon ?"
          message="Le bon sera marqué comme annulé. Cette action est irréversible."
          onConfirm={onCancelConfirm}
          onCancel={onCancelDismiss}
          loading={cancelLoading}
          danger
        />
      )}

      {/* Modal présentiel (s'ouvre après le cachet IT) */}
      {inPersonModal && (
        <InPersonModal
          type={inPersonModal.type}
          token={inPersonModal.token}
          onClose={onInPersonClose}
        />
      )}

      {/* Modal cachet IT — s'ouvre avant chaque action mise à dispo / restitution */}
      {pendingItAction && (
        <ItSignModal
          bonId={bon.id}
          reference={bon.reference}
          pdfType={pendingItAction.pdfType}
          description={pendingItAction.description}
          onClose={onItSignClose}
          onSigned={onItSigned}
        />
      )}

      {/* Modal restitution avec sélection d'équipements */}
      {showRestitutionModal && (
        <RestitutionModal
          equipments={bon.equipments}
          onConfirm={onRestitutionConfirm}
          onCancel={onRestitutionCancel}
          loading={restitutionLoading}
        />
      )}

      {/* Modal déclarer non rendu */}
      {showNotReturnedModal && (
        <DeclareNotReturnedModal
          equipments={bon.equipments}
          onConfirm={onNotReturnedConfirm}
          onCancel={onNotReturnedCancel}
          loading={notReturnedLoading}
        />
      )}

      {/* Modal équipement retrouvé */}
      {showMarkFoundModal && (
        <MarkFoundModal
          equipments={bon.equipments}
          onConfirm={onMarkFoundConfirm}
          onCancel={onMarkFoundCancel}
          loading={markFoundLoading}
          isArchived={bon.status === 'archived'}
        />
      )}

      {/* Modal clôture unilatérale (motif obligatoire) */}
      {showCloseUnilateralModal && (
        <CloseUnilateralModal
          outcomeLabel={bon.status === 'sent_mise_dispo' ? 'activé (remise constatée)' : 'archivé'}
          onConfirm={onCloseUnilateralConfirm}
          onCancel={onCloseUnilateralCancel}
          loading={closeUnilateralLoading}
        />
      )}

      {/* Confirmation renvoi lien récent (< 1h) */}
      {resendConfirmSentAt && (() => {
        const minutesAgo = Math.floor((Date.now() - new Date(resendConfirmSentAt).getTime()) / 60000);
        const label = minutesAgo < 1 ? 'il y a moins d\'une minute' : `il y a ${minutesAgo} minute${minutesAgo > 1 ? 's' : ''}`;
        return (
          <ConfirmModal
            title="Lien récemment envoyé"
            message={`Un lien de signature a déjà été envoyé ${label}. Le collaborateur l'a peut-être reçu. Renvoyer quand même ?`}
            onConfirm={onResendForce}
            onCancel={onResendDismiss}
            loading={resendLoading}
          />
        );
      })()}
    </>
  );
}
