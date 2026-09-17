import { useState } from 'react';
import type { FailedItAction, PendingItAction, SendSerialConflict } from '../types';

/** État (pur) de toutes les modales/confirmations de la fiche bon — aucun
 *  appel API ici, seulement les booléens/valeurs qui pilotent leur affichage
 *  et les setters correspondants. Regroupé à part de useBonActions pour
 *  isoler ce qui est de la présentation de ce qui est de l'action métier. */
export function useBonModalsState() {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingItAction, setPendingItAction] = useState<PendingItAction | null>(null);
  const [failedItAction, setFailedItAction] = useState<FailedItAction | null>(null);
  const [retryingFailedItAction, setRetryingFailedItAction] = useState(false);
  const [inPersonModal, setInPersonModal] = useState<{
    type: 'mise_disposition' | 'restitution';
    token: string;
  } | null>(null);
  const [showRestitutionModal, setShowRestitutionModal] = useState(false);
  const [showNotReturnedModal, setShowNotReturnedModal] = useState(false);
  const [showMarkFoundModal, setShowMarkFoundModal] = useState(false);
  const [showCloseUnilateralModal, setShowCloseUnilateralModal] = useState(false);
  const [resendConfirmSentAt, setResendConfirmSentAt] = useState<string | null>(null);
  const [sendSerialConflicts, setSendSerialConflicts] = useState<SendSerialConflict[] | null>(null);

  return {
    confirmCancel,
    setConfirmCancel,
    pendingItAction,
    setPendingItAction,
    failedItAction,
    setFailedItAction,
    retryingFailedItAction,
    setRetryingFailedItAction,
    inPersonModal,
    setInPersonModal,
    showRestitutionModal,
    setShowRestitutionModal,
    showNotReturnedModal,
    setShowNotReturnedModal,
    showMarkFoundModal,
    setShowMarkFoundModal,
    showCloseUnilateralModal,
    setShowCloseUnilateralModal,
    resendConfirmSentAt,
    setResendConfirmSentAt,
    sendSerialConflicts,
    setSendSerialConflicts,
  };
}
