import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { BonDetailData, PdfSnapshotInfo, PendingItAction } from './types';

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
  const [resendConfirmSentAt, setResendConfirmSentAt] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api.get<BonDetailData>(`/bons/${id}`)
      .then((b) => {
        setBon(b);
        api.get<PdfSnapshotInfo[]>(`/bons/${b.id}/pdf-snapshots`)
          .then(setPdfSnapshots)
          .catch(() => setPdfSnapshots([]));
      })
      .catch((e: any) => setLoadError(e?.message ?? 'Erreur lors du chargement du bon'))
      .finally(() => setLoading(false));
  };

  const doSend = async () => {
    setActionLoading('send');
    try {
      await api.post(`/bons/${id}/send`);
      load();
    } finally { setActionLoading(null); }
  };

  const doCancel = async () => {
    setActionLoading('cancel');
    try {
      await api.delete(`/bons/${id}`);
      load();
    } finally { setActionLoading(null); setConfirmCancel(false); }
  };

  const doRestitution = async (returnedEquipmentIds?: string[]) => {
    setActionLoading('restitution');
    try {
      await api.post(`/bons/${id}/initiate-restitution`, { returnedEquipmentIds });
      setShowRestitutionModal(false);
      load();
    } finally { setActionLoading(null); }
  };

  const doDeclareNotReturned = async (equipmentIds: string[], reason: string, signatureDataUrl: string) => {
    setActionLoading('notreturned');
    try {
      await api.post(`/bons/${id}/declare-not-returned`, { equipmentIds, reason, signatureDataUrl });
      setShowNotReturnedModal(false);
      load();
    } finally { setActionLoading(null); }
  };

  const doMarkFound = async (equipmentIds: string[], signatureDataUrl: string) => {
    setActionLoading('markfound');
    try {
      await api.post(`/bons/${id}/mark-found`, { equipmentIds, signatureDataUrl });
      setShowMarkFoundModal(false);
      load();
    } finally { setActionLoading(null); }
  };

  const doInPerson = async (type: 'mise_disposition' | 'restitution') => {
    setActionLoading('inperson');
    try {
      const res = await api.post<{ bon: any; token: string }>(`/bons/${id}/initiate-inperson`, { type });
      setInPersonModal({ type, token: res.token });
      load();
    } finally { setActionLoading(null); }
  };

  const doResend = async (force = false) => {
    setActionLoading('resend');
    try {
      await api.post(`/bons/${id}/resend`, force ? { force: true } : undefined);
      toast({ title: 'Lien renvoyé', description: 'Le lien de signature a été renvoyé avec succès.' });
      setResendConfirmSentAt(null);
      load();
    } catch (e: any) {
      if ((e as any)?.status === 409) {
        try {
          const parsed = JSON.parse(e.message);
          if (parsed.code === 'token_recent') {
            setResendConfirmSentAt(parsed.sentAt);
            return;
          }
        } catch { /* not JSON, fall through */ }
      }
      toast({ title: 'Erreur', description: e?.message ?? 'Erreur lors du renvoi', variant: 'destructive' });
    } finally { setActionLoading(null); }
  };

  const downloadPdf = async (type: 'mise_disposition' | 'restitution', loadingKey = 'header') => {
    setPdfLoading(loadingKey);
    try {
      const response = await fetch(`/api/bons/${id}/pdf?type=${type}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur PDF');
      const blob = await response.blob();
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
      const response = await fetch(`/api/bons/${id}/pdf?stage=${stage}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur PDF');
      const blob = await response.blob();
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
    confirmCancel,
    pendingItAction,
    inPersonModal,
    showRestitutionModal,
    showNotReturnedModal,
    showMarkFoundModal,
    resendConfirmSentAt,
    load,
    doSend,
    doCancel,
    doRestitution,
    doDeclareNotReturned,
    doMarkFound,
    doInPerson,
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
    setResendConfirmSentAt,
  };
}
