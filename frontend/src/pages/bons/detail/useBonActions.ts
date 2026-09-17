import { useState } from 'react';
import { useBonLoadState } from './actions/useBonLoadState';
import { usePdfDownloads } from './actions/usePdfDownloads';
import { useBonModalsState } from './actions/useBonModalsState';
import { useSendActions } from './actions/useSendActions';
import { useRestitutionActions } from './actions/useRestitutionActions';
import { useClosureActions } from './actions/useClosureActions';
import { useItSignActions } from './actions/useItSignActions';

export interface UseBonActionsOptions {
  /** Autorise l'appel à GET /bons/:id/pdf-snapshots/missing (réservé IT — le
   *  portail collaborateur n'a pas besoin de savoir quels documents manquent
   *  et ne doit donc pas déclencher cet appel). Défaut : false. */
  isItStaff?: boolean;
}

/** Façade qui recompose l'état et les actions de la fiche bon depuis les
 *  hooks dédiés (chargement, téléchargement PDF, état des modales, familles
 *  d'actions send/restitution/clôture/cachet IT) — la forme de retour reste
 *  strictement identique à l'ancienne implémentation monolithique. */
export function useBonActions(id: string | undefined, options?: UseBonActionsOptions) {
  const isItStaff = options?.isItStaff ?? false;

  const loadState = useBonLoadState(id, isItStaff);
  const pdf = usePdfDownloads(id, loadState.bon);
  const modals = useBonModalsState();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const send = useSendActions({
    id,
    reload: loadState.reload,
    setActionLoading,
    setSendSerialConflicts: modals.setSendSerialConflicts,
  });

  const restitution = useRestitutionActions({
    id,
    reload: loadState.reload,
    setActionLoading,
    setShowRestitutionModal: modals.setShowRestitutionModal,
    setShowNotReturnedModal: modals.setShowNotReturnedModal,
    setShowMarkFoundModal: modals.setShowMarkFoundModal,
  });

  const closure = useClosureActions({
    id,
    reload: loadState.reload,
    setActionLoading,
    setConfirmCancel: modals.setConfirmCancel,
    setShowCloseUnilateralModal: modals.setShowCloseUnilateralModal,
    setResendConfirmSentAt: modals.setResendConfirmSentAt,
    setInPersonModal: modals.setInPersonModal,
  });

  const itSign = useItSignActions({
    setPendingItAction: modals.setPendingItAction,
    failedItAction: modals.failedItAction,
    setFailedItAction: modals.setFailedItAction,
    setRetryingFailedItAction: modals.setRetryingFailedItAction,
  });

  return {
    bon: loadState.bon,
    loading: loadState.loading,
    refreshing: loadState.refreshing,
    loadError: loadState.loadError,
    actionLoading,
    pdfLoading: pdf.pdfLoading,
    pdfSnapshots: loadState.pdfSnapshots,
    missingSnapshots: loadState.missingSnapshots,
    regeneratingSnapshots: loadState.regeneratingSnapshots,
    notifLogs: loadState.notifLogs,
    confirmCancel: modals.confirmCancel,
    pendingItAction: modals.pendingItAction,
    failedItAction: modals.failedItAction,
    retryingFailedItAction: modals.retryingFailedItAction,
    inPersonModal: modals.inPersonModal,
    showRestitutionModal: modals.showRestitutionModal,
    showNotReturnedModal: modals.showNotReturnedModal,
    showMarkFoundModal: modals.showMarkFoundModal,
    showCloseUnilateralModal: modals.showCloseUnilateralModal,
    resendConfirmSentAt: modals.resendConfirmSentAt,
    sendSerialConflicts: modals.sendSerialConflicts,
    load: loadState.load,
    reload: loadState.reload,
    doSend: send.doSend,
    doCancel: closure.doCancel,
    doRestitution: restitution.doRestitution,
    doDeclareNotReturned: restitution.doDeclareNotReturned,
    doMarkFound: restitution.doMarkFound,
    doInPerson: closure.doInPerson,
    doCloseUnilateral: closure.doCloseUnilateral,
    doResend: closure.doResend,
    downloadPdf: pdf.downloadPdf,
    downloadPdfSnapshot: pdf.downloadPdfSnapshot,
    regenerateMissingSnapshots: loadState.regenerateMissingSnapshots,
    headerPdfType: pdf.headerPdfType,
    triggerWithItSign: itSign.triggerWithItSign,
    retryFailedItAction: itSign.retryFailedItAction,
    confirmSendDespiteConflicts: send.confirmSendDespiteConflicts,
    setConfirmCancel: modals.setConfirmCancel,
    setPendingItAction: modals.setPendingItAction,
    setFailedItAction: modals.setFailedItAction,
    setInPersonModal: modals.setInPersonModal,
    setShowRestitutionModal: modals.setShowRestitutionModal,
    setShowNotReturnedModal: modals.setShowNotReturnedModal,
    setShowMarkFoundModal: modals.setShowMarkFoundModal,
    setShowCloseUnilateralModal: modals.setShowCloseUnilateralModal,
    setResendConfirmSentAt: modals.setResendConfirmSentAt,
    setSendSerialConflicts: modals.setSendSerialConflicts,
  };
}
