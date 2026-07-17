import { useState, useRef, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { BonDetailData, NotificationLog, PdfSnapshotInfo, PendingItAction } from './types';

function showActionError(e: unknown, fallback: string) {
  toast({
    title: 'Erreur',
    description: e instanceof Error && e.message ? e.message : fallback,
    variant: 'destructive',
  });
}

export function useBonActions(id: string | undefined) {
  const [bon, setBon] = useState<BonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [pdfSnapshots, setPdfSnapshots] = useState<PdfSnapshotInfo[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingItAction, setPendingItAction] = useState<PendingItAction | null>(null);
  const [inPersonModal, setInPersonModal] = useState<{
    type: 'mise_disposition' | 'restitution';
    token: string;
  } | null>(null);
  const [showRestitutionModal, setShowRestitutionModal] = useState(false);
  const [showNotReturnedModal, setShowNotReturnedModal] = useState(false);
  const [showMarkFoundModal, setShowMarkFoundModal] = useState(false);
  const [showCloseUnilateralModal, setShowCloseUnilateralModal] = useState(false);
  const [resendConfirmSentAt, setResendConfirmSentAt] = useState<string | null>(null);
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
  };

  const loadNotifLogs = (bonId: string) => {
    api.get<NotificationLog[]>(`/bons/${bonId}/notifications`)
      .then(setNotifLogs)
      .catch(() => setNotifLogs([]));
  };

  const load = () => {
    setLoading(true);
    setLoadError(null);
    // Annuler un éventuel retry en cours
    if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current);
    api.get<BonDetailData>(`/bons/${id}`)
      .then((b) => {
        setBon(b);
        loadSnapshots(b.id);
        loadNotifLogs(b.id);
        // Re-fetch snapshots après 2s pour capter les PDF générés en async
        snapshotRetryRef.current = setTimeout(() => loadSnapshots(b.id), 2000);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Erreur lors du chargement du bon'))
      .finally(() => setLoading(false));
  };

  const doSend = async () => {
    setActionLoading('send');
    try {
      await api.post(`/bons/${id}/send`);
      load();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'envoi du bon");
    } finally { setActionLoading(null); }
  };

  const doCancel = async () => {
    setActionLoading('cancel');
    try {
      await api.delete(`/bons/${id}`);
      load();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'annulation du bon");
    } finally { setActionLoading(null); setConfirmCancel(false); }
  };

  const doRestitution = async (returnedEquipmentIds?: string[]) => {
    setActionLoading('restitution');
    try {
      await api.post(`/bons/${id}/initiate-restitution`, { returnedEquipmentIds });
      setShowRestitutionModal(false);
      load();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'initiation de la restitution");
    } finally { setActionLoading(null); }
  };

  const doDeclareNotReturned = async (equipmentIds: string[], reason: string, signatureDataUrl: string) => {
    setActionLoading('notreturned');
    try {
      await api.post(`/bons/${id}/declare-not-returned`, { equipmentIds, reason, signatureDataUrl });
      setShowNotReturnedModal(false);
      load();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la déclaration de non-restitution');
    } finally { setActionLoading(null); }
  };

  const doMarkFound = async (equipmentIds: string[], signatureDataUrl: string) => {
    setActionLoading('markfound');
    try {
      await api.post(`/bons/${id}/mark-found`, { equipmentIds, signatureDataUrl });
      setShowMarkFoundModal(false);
      load();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de la déclaration d'équipement retrouvé");
    } finally { setActionLoading(null); }
  };

  const doInPerson = async (type: 'mise_disposition' | 'restitution') => {
    setActionLoading('inperson');
    try {
      const res = await api.post<{ bon: BonDetailData; token: string }>(`/bons/${id}/initiate-inperson`, { type });
      setInPersonModal({ type, token: res.token });
      load();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la préparation de la signature en présentiel');
    } finally { setActionLoading(null); }
  };

  const doCloseUnilateral = async (reason: string) => {
    setActionLoading('closeunilateral');
    try {
      await api.post(`/bons/${id}/close-unilateral`, { reason });
      setShowCloseUnilateralModal(false);
      toast({ title: 'Bon clôturé', description: 'Le bon a été clôturé sans signature, avec mention sur le document.' });
      load();
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
      load();
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
    } catch {
      toast({ title: 'Erreur PDF', description: 'Erreur lors de la génération du PDF', variant: 'destructive' });
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
    } catch {
      toast({ title: 'Erreur PDF', description: 'Erreur lors du téléchargement du PDF', variant: 'destructive' });
    } finally { setPdfLoading(null); }
  };

  const triggerWithItSign = (
    pdfType: 'mise_disposition' | 'restitution',
    description: string,
    onSigned: () => Promise<void>,
  ) => {
    setPendingItAction({ pdfType, description, onSigned });
  };

  return {
    bon,
    loading,
    loadError,
    actionLoading,
    pdfLoading,
    pdfSnapshots,
    notifLogs,
    confirmCancel,
    pendingItAction,
    inPersonModal,
    showRestitutionModal,
    showNotReturnedModal,
    showMarkFoundModal,
    showCloseUnilateralModal,
    resendConfirmSentAt,
    load,
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
    headerPdfType,
    triggerWithItSign,
    setConfirmCancel,
    setPendingItAction,
    setInPersonModal,
    setShowRestitutionModal,
    setShowNotReturnedModal,
    setShowMarkFoundModal,
    setShowCloseUnilateralModal,
    setResendConfirmSentAt,
  };
}
