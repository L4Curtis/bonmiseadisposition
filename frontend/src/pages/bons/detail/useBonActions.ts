import { useState, useRef, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { errorMessage, showActionError } from '@/lib/errors';
import type {
  BonDetailData,
  FailedItAction,
  NotificationLog,
  PdfSnapshotInfo,
  PendingItAction,
  SendSerialConflict,
} from './types';

export interface UseBonActionsOptions {
  /** Autorise l'appel à GET /bons/:id/pdf-snapshots/missing (réservé IT — le
   *  portail collaborateur n'a pas besoin de savoir quels documents manquent
   *  et ne doit donc pas déclencher cet appel). Défaut : false. */
  isItStaff?: boolean;
}

export function useBonActions(id: string | undefined, options?: UseBonActionsOptions) {
  const isItStaff = options?.isItStaff ?? false;
  const [bon, setBon] = useState<BonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  // Rafraîchissement après une action (distinct du chargement initial) : ne
  // vide jamais la page ni les modales ouvertes (ex. présentiel) le temps du
  // re-fetch — contrairement à `loading`, qui affiche un spinner plein écran.
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [pdfSnapshots, setPdfSnapshots] = useState<PdfSnapshotInfo[]>([]);
  // Types de snapshot attendus mais absents. Contrat backend confirmé : GET
  // /bons/:id/pdf-snapshots reste un tableau (le portail collaborateur en
  // dépend, ne pas le changer) ; la liste des manquants vit sur une route
  // séparée GET /bons/:id/pdf-snapshots/missing → { missing: string[] },
  // appelée uniquement pour l'IT (voir `isItStaff` ci-dessus).
  const [missingSnapshots, setMissingSnapshots] = useState<string[]>([]);
  const [regeneratingSnapshots, setRegeneratingSnapshots] = useState(false);
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
  const [notifLogs, setNotifLogs] = useState<NotificationLog[]>([]);

  const snapshotRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending snapshot re-fetch when the page unmounts
  useEffect(() => () => {
    if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current);
  }, []);

  const loadSnapshots = (bonId: string) => {
    api.get<PdfSnapshotInfo[]>(`/bons/${bonId}/pdf-snapshots`)
      .then(setPdfSnapshots)
      .catch(() => setPdfSnapshots([]));

    // Route séparée, IT uniquement : un collaborateur consultant son bon
    // via le portail n'a aucun intérêt (ni droit) à connaître les documents
    // manquants, et cet appel ne doit donc pas partir depuis ce contexte.
    if (isItStaff) {
      api.get<{ missing: string[] }>(`/bons/${bonId}/pdf-snapshots/missing`)
        .then((r) => setMissingSnapshots(r.missing ?? []))
        .catch(() => setMissingSnapshots([]));
    } else {
      setMissingSnapshots([]);
    }
  };

  /** Admin uniquement — régénère les PdfSnapshot manquants pour les
   *  signatures déjà signées. Opération globale côté backend (aucun
   *  paramètre : POST /admin/pdf/regenerate-missing, voir
   *  backend/src/pdf/pdf-admin.controller.ts), pas limitée à ce bon — on
   *  recharge simplement les snapshots de ce bon une fois lancée. */
  const regenerateMissingSnapshots = async () => {
    if (!id) return;
    setRegeneratingSnapshots(true);
    try {
      await api.post('/admin/pdf/regenerate-missing');
      toast({ title: 'Régénération lancée', description: 'Les documents manquants vont être régénérés.' });
      loadSnapshots(id);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la régénération des documents');
    } finally {
      setRegeneratingSnapshots(false);
    }
  };

  const loadNotifLogs = (bonId: string) => {
    api.get<NotificationLog[]>(`/bons/${bonId}/notifications`)
      .then(setNotifLogs)
      .catch(() => setNotifLogs([]));
  };

  /** Chargement du bon. `initial` pilote QUEL indicateur de chargement est
   *  utilisé : plein écran (`loading`) au premier montage, discret
   *  (`refreshing`) après une action — pour ne pas vider la page ni fermer
   *  les modales pendant un simple rafraîchissement. */
  const fetchBon = (initial: boolean) => {
    if (initial) setLoading(true); else setRefreshing(true);
    setLoadError(null);
    // Annuler un éventuel retry en cours
    if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current);
    return api.get<BonDetailData>(`/bons/${id}`)
      .then((b) => {
        setBon(b);
        loadSnapshots(b.id);
        loadNotifLogs(b.id);
        // Re-fetch snapshots après 2s pour capter les PDF générés en async
        snapshotRetryRef.current = setTimeout(() => loadSnapshots(b.id), 2000);
      })
      .catch((e: unknown) => setLoadError(errorMessage(e, 'Erreur lors du chargement du bon')))
      .finally(() => { if (initial) setLoading(false); else setRefreshing(false); });
  };

  /** Chargement initial (plein écran). */
  const load = () => fetchBon(true);
  /** Rafraîchissement après une action (discret). */
  const reload = () => fetchBon(false);

  const doSend = async (confirmSerialConflicts = false): Promise<boolean> => {
    setActionLoading('send');
    try {
      await api.post(`/bons/${id}/send`, confirmSerialConflicts ? { confirmSerialConflicts: true } : undefined);
      setSendSerialConflicts(null);
      reload();
      return true;
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { code?: string; conflicts?: SendSerialConflict[] } | undefined;
        if (body?.code === 'serial_conflicts') {
          setSendSerialConflicts(body.conflicts ?? []);
          return false;
        }
      }
      showActionError(e, "Erreur lors de l'envoi du bon");
      return false;
    } finally { setActionLoading(null); }
  };

  const doCancel = async () => {
    setActionLoading('cancel');
    try {
      await api.delete(`/bons/${id}`);
      reload();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'annulation du bon");
    } finally { setActionLoading(null); setConfirmCancel(false); }
  };

  const doRestitution = async (returnedEquipmentIds?: string[]): Promise<boolean> => {
    setActionLoading('restitution');
    try {
      await api.post(`/bons/${id}/initiate-restitution`, { returnedEquipmentIds });
      setShowRestitutionModal(false);
      reload();
      return true;
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'initiation de la restitution");
      return false;
    } finally { setActionLoading(null); }
  };

  const doDeclareNotReturned = async (equipmentIds: string[], reason: string, signatureDataUrl: string) => {
    setActionLoading('notreturned');
    try {
      await api.post(`/bons/${id}/declare-not-returned`, { equipmentIds, reason, signatureDataUrl });
      setShowNotReturnedModal(false);
      reload();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la déclaration de non-restitution');
    } finally { setActionLoading(null); }
  };

  const doMarkFound = async (equipmentIds: string[], signatureDataUrl: string) => {
    setActionLoading('markfound');
    try {
      await api.post(`/bons/${id}/mark-found`, { equipmentIds, signatureDataUrl });
      setShowMarkFoundModal(false);
      reload();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de la déclaration d'équipement retrouvé");
    } finally { setActionLoading(null); }
  };

  const doInPerson = async (type: 'mise_disposition' | 'restitution'): Promise<boolean> => {
    setActionLoading('inperson');
    try {
      const res = await api.post<{ bon: BonDetailData; token: string }>(`/bons/${id}/initiate-inperson`, { type });
      setInPersonModal({ type, token: res.token });
      reload();
      return true;
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la préparation de la signature en présentiel');
      return false;
    } finally { setActionLoading(null); }
  };

  const doCloseUnilateral = async (reason: string) => {
    setActionLoading('closeunilateral');
    try {
      await api.post(`/bons/${id}/close-unilateral`, { reason });
      setShowCloseUnilateralModal(false);
      toast({ title: 'Bon clôturé', description: 'Le bon a été clôturé sans signature, avec mention sur le document.' });
      reload();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la clôture unilatérale');
    } finally { setActionLoading(null); }
  };

  const doResend = async (force = false) => {
    setActionLoading('resend');
    try {
      await api.post(`/bons/${id}/resend`, force ? { force: true } : undefined);
      toast({ title: 'Lien renvoyé', description: 'Le lien de signature a été renvoyé avec succès.' });
      setResendConfirmSentAt(null);
      reload();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { code?: string; sentAt?: string } | undefined;
        if (body?.code === 'token_recent' && body.sentAt) {
          setResendConfirmSentAt(body.sentAt);
          return;
        }
      }
      showActionError(e, 'Erreur lors du renvoi');
    } finally { setActionLoading(null); }
  };

  const downloadPdf = async (type: 'mise_disposition' | 'restitution', loadingKey = 'header') => {
    setPdfLoading(loadingKey);
    try {
      const blob = await api.getBlob(`/bons/${id}/pdf?type=${type}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bon-${bon?.reference || id}${type === 'restitution' ? '-restitution' : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: 'Erreur PDF', description: errorMessage(e, 'Erreur lors de la génération du PDF'), variant: 'destructive' });
    } finally { setPdfLoading(null); }
  };

  const headerPdfType = (): 'mise_disposition' | 'restitution' => {
    if (!bon) return 'mise_disposition';
    return ['archived', 'sent_restitution', 'partially_returned'].includes(bon.status) ? 'restitution' : 'mise_disposition';
  };

  const downloadPdfSnapshot = async (stage: string, loadingKey: string) => {
    setPdfLoading(loadingKey);
    try {
      const blob = await api.getBlob(`/bons/${id}/pdf?stage=${stage}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bon?.reference || id}_${stage}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: 'Erreur PDF', description: errorMessage(e, 'Erreur lors du téléchargement du PDF'), variant: 'destructive' });
    } finally { setPdfLoading(null); }
  };

  /** Ouvre la modale de cachet IT. `onSigned` s'exécute APRÈS l'apposition
   *  du cachet (déjà en base à ce stade) et renvoie `false` en cas d'échec —
   *  l'appelant garde alors trace de l'action à relancer SANS redemander de
   *  signature (voir `failedItAction` / `retryFailedItAction`). */
  const triggerWithItSign = (
    pdfType: 'mise_disposition' | 'restitution',
    description: string,
    onSigned: () => Promise<boolean>,
  ) => {
    setPendingItAction({ pdfType, description, onSigned });
  };

  /** Relance l'action qui suit le cachet IT, sans re-signer. */
  const retryFailedItAction = async () => {
    if (!failedItAction) return;
    setRetryingFailedItAction(true);
    try {
      const ok = await failedItAction.retry();
      if (ok) setFailedItAction(null);
    } finally {
      setRetryingFailedItAction(false);
    }
  };

  /** Confirme l'envoi malgré des numéros de série déjà en circulation
   *  ailleurs (409 serial_conflicts sur POST /bons/:id/send). */
  const confirmSendDespiteConflicts = () => doSend(true);

  return {
    bon,
    loading,
    refreshing,
    loadError,
    actionLoading,
    pdfLoading,
    pdfSnapshots,
    missingSnapshots,
    regeneratingSnapshots,
    notifLogs,
    confirmCancel,
    pendingItAction,
    failedItAction,
    retryingFailedItAction,
    inPersonModal,
    showRestitutionModal,
    showNotReturnedModal,
    showMarkFoundModal,
    showCloseUnilateralModal,
    resendConfirmSentAt,
    sendSerialConflicts,
    load,
    reload,
    doSend,
    doCancel,
    doRestitution,
    doDeclareNotReturned,
    doMarkFound,
    doInPerson,
    doCloseUnilateral,
    doResend,
    downloadPdf,
    downloadPdfSnapshot,
    regenerateMissingSnapshots,
    headerPdfType,
    triggerWithItSign,
    retryFailedItAction,
    confirmSendDespiteConflicts,
    setConfirmCancel,
    setPendingItAction,
    setFailedItAction,
    setInPersonModal,
    setShowRestitutionModal,
    setShowNotReturnedModal,
    setShowMarkFoundModal,
    setShowCloseUnilateralModal,
    setResendConfirmSentAt,
    setSendSerialConflicts,
  };
}
