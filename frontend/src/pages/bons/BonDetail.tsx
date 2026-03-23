import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateLong, formatDateTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  Download,
  Send,
  XCircle,
  Pencil,
  Loader2,
  RotateCcw,
  User,
  CheckCircle2,
  Clock,
  Smartphone,
  Stamp,
  AlertTriangle,
  FileText,
  PackageCheck,
} from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';
import type { BonDetailData, PdfSnapshotInfo, PendingItAction } from './detail/types';
import { equipmentLabel, sigTypeLabel, SNAPSHOT_LABELS } from './detail/types';
import { ConfirmModal } from './detail/ConfirmModal';
import { InPersonModal } from './detail/InPersonModal';
import { ItSignModal } from './detail/ItSignModal';
import { RestitutionModal } from './detail/RestitutionModal';
import { DeclareNotReturnedModal } from './detail/DeclareNotReturnedModal';
import { MarkFoundModal } from './detail/MarkFoundModal';

// ─── Page principale ──────────────────────────────────────────────────────────

export function BonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [bon, setBon] = useState<BonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  /** Action en attente après signature IT (null = pas de modal IT ouverte) */
  const [pendingItAction, setPendingItAction] = useState<PendingItAction | null>(null);

  /** Lien présentiel à afficher après la signature IT */
  const [inPersonModal, setInPersonModal] = useState<{
    type: 'mise_disposition' | 'restitution';
    token: string;
  } | null>(null);

  /** Modal restitution avec sélection d'équipements */
  const [showRestitutionModal, setShowRestitutionModal] = useState(false);

  /** Modal déclaration non-rendu */
  const [showNotReturnedModal, setShowNotReturnedModal] = useState(false);

  /** Modal équipement retrouvé */
  const [showMarkFoundModal, setShowMarkFoundModal] = useState(false);

  /** Confirmation renvoi lien récent — contient la date d'envoi si < 1h */
  const [resendConfirmSentAt, setResendConfirmSentAt] = useState<string | null>(null);

  /** PDF snapshots disponibles */
  const [pdfSnapshots, setPdfSnapshots] = useState<PdfSnapshotInfo[]>([]);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api.get<BonDetailData>(`/bons/${id}`)
      .then((b) => {
        setBon(b);
        // Load PDF snapshots
        api.get<PdfSnapshotInfo[]>(`/bons/${b.id}/pdf-snapshots`)
          .then(setPdfSnapshots)
          .catch(() => setPdfSnapshots([]));
      })
      .catch((e: any) => setLoadError(e?.message ?? 'Erreur lors du chargement du bon'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  // ── Actions backend ──────────────────────────────────────────────────────────

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

  // ── Déclencheurs avec cachet IT ──────────────────────────────────────────────

  /**
   * Ouvre la modal du cachet IT, puis exécute l'action une fois le cachet apposé.
   */
  const triggerWithItSign = (
    pdfType: 'mise_disposition' | 'restitution',
    description: string,
    onSigned: () => Promise<void>,
  ) => {
    setPendingItAction({ pdfType, description, onSigned });
  };

  const handleItSendClick = () => {
    triggerWithItSign(
      'mise_disposition',
      'Apposez votre cachet pour certifier la remise des équipements. L\'email de signature sera ensuite envoyé au collaborateur.',
      doSend,
    );
  };

  const handleItInPersonMiseClick = () => {
    triggerWithItSign(
      'mise_disposition',
      'Apposez votre cachet pour certifier la remise, puis donnez le lien de signature au collaborateur.',
      () => doInPerson('mise_disposition'),
    );
  };

  const handleItRestitutionClick = () => {
    setShowRestitutionModal(true);
  };

  /** Appelé après sélection d'équipements dans la modal restitution */
  const handleRestitutionConfirm = (selectedIds: string[]) => {
    if (isItStaff) {
      // IT doit signer d'abord, puis la restitution est lancée
      setShowRestitutionModal(false);
      triggerWithItSign(
        'restitution',
        'Apposez votre cachet pour confirmer la restitution des équipements. L\'email sera ensuite envoyé au collaborateur.',
        () => doRestitution(selectedIds),
      );
    } else {
      doRestitution(selectedIds);
    }
  };

  const handleItInPersonRestitutionClick = () => {
    triggerWithItSign(
      'restitution',
      'Apposez votre cachet pour la restitution, puis donnez le lien de signature au collaborateur.',
      () => doInPerson('restitution'),
    );
  };

  // ── Téléchargement PDF ───────────────────────────────────────────────────────

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

  // ── Rendu ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16" aria-live="polite">
        <div className="h-7 w-7 animate-spin motion-reduce:animate-none rounded-full border-4 border-blue-600 border-t-transparent" role="status">
          <span className="sr-only">Chargement du bon</span>
        </div>
      </div>
    );
  }

  if (!bon) {
    return (
      <div className="text-center py-16 text-muted-foreground/70" role="alert">
        {loadError ? (
          <>
            <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
            <p className="text-red-600">{loadError}</p>
          </>
        ) : (
          <p>Bon introuvable</p>
        )}
        <button className="mt-3 text-blue-600 text-sm hover:underline" onClick={() => navigate('/bons')}>
          Retour à la liste
        </button>
      </div>
    );
  }

  const civiliteLabel = bon.civilite === 'mme' ? 'Mme' : 'M.';
  const isDraft = bon.status === 'draft';
  const isActive = bon.status === 'active';
  const isPartiallyReturned = bon.status === 'partially_returned';
  const canInitiateRestitution = isActive || isPartiallyReturned;
  const isCancellable = !['archived', 'cancelled'].includes(bon.status);
  const isItStaff = currentUser?.isItStaff ?? false;
  const isSentWaiting = ['sent_mise_dispo', 'sent_restitution'].includes(bon.status);
  const showEquipmentStatus = ['sent_restitution', 'partially_returned', 'archived'].includes(bon.status);

  // Pending pv_cloture signature (awaiting collab co-signature)
  const hasPendingPvCloture = bon.signatures?.some(
    (s) => s.type === 'pv_cloture' && !s.signed && new Date() < new Date(s.tokenExpiresAt),
  );

  const hasNotReturnedEquipment = bon.equipments.some((eq) => eq.notReturned);

  const sigPdfType = (sigType: string): 'mise_disposition' | 'restitution' =>
    sigType === 'restitution' ? 'restitution' : 'mise_disposition';

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/bons')} className="text-muted-foreground/70 hover:text-muted-foreground" aria-label="Retour à la liste des bons">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono text-foreground">{bon.reference}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${BON_STATUS_COLORS[bon.status]}`}>
                {BON_STATUS_LABELS[bon.status]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Créé le {formatDateLong(bon.createdAt)} par {bon.createdBy.displayName}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Bouton PDF principal */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadPdf(headerPdfType(), 'header')}
            disabled={pdfLoading === 'header'}
          >
            {pdfLoading === 'header'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              : <Download className="h-3.5 w-3.5" />}
            PDF
          </Button>

          {isDraft && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/bons/${id}/edit`)}>
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </Button>

              {/* Envoyer — IT signe d'abord, puis email part au collaborateur */}
              <Button
                size="sm"
                onClick={isItStaff ? handleItSendClick : () => doSend()}
                disabled={!!actionLoading}
              >
                {actionLoading === 'send'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  : <Send className="h-3.5 w-3.5" />}
                Envoyer
              </Button>

              {/* Présentiel — IT signe, puis lien pour collaborateur */}
              <Button
                variant="outline"
                size="sm"
                onClick={isItStaff ? handleItInPersonMiseClick : () => doInPerson('mise_disposition')}
                disabled={!!actionLoading}
              >
                <Smartphone className="h-3.5 w-3.5" /> Présentiel
              </Button>
            </>
          )}

          {canInitiateRestitution && (
            <>
              {/* Initier restitution — ouvre modal de sélection d'équipements */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleItRestitutionClick}
                disabled={!!actionLoading}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Initier restitution
              </Button>

              {/* Restitution présentielle */}
              <Button
                variant="outline"
                size="sm"
                onClick={isItStaff ? handleItInPersonRestitutionClick : () => doInPerson('restitution')}
                disabled={!!actionLoading}
              >
                <Smartphone className="h-3.5 w-3.5" /> Restitution présentielle
              </Button>

              {/* Déclarer non rendu — uniquement IT */}
              {isItStaff && bon.equipments.some((eq) => !eq.returnedAt && !eq.notReturned) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  onClick={() => setShowNotReturnedModal(true)}
                  disabled={!!actionLoading}
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Non rendu
                </Button>
              )}

            </>
          )}

          {/* Équipement retrouvé — IT peut mettre à jour le PV (ou générer un avenant si archivé) */}
          {isItStaff && hasNotReturnedEquipment && (
            <Button
              variant="outline"
              size="sm"
              className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 border-green-200 dark:border-green-800"
              onClick={() => setShowMarkFoundModal(true)}
              disabled={!!actionLoading}
            >
              <PackageCheck className="h-3.5 w-3.5" /> Équipement retrouvé
            </Button>
          )}

          {/* Renvoyer le lien — disponible pour IT quand le bon est en attente de signature ou PV en attente */}
          {(isSentWaiting || hasPendingPvCloture) && isItStaff && (
            <Button
              variant="outline"
              size="sm"
              onClick={doResend}
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
              onClick={() => setConfirmCancel(true)}
            >
              <XCircle className="h-3.5 w-3.5" /> Annuler
            </Button>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Collaborateur</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground/70 w-28 shrink-0">Nom</span>
              <span className="font-medium">{civiliteLabel} {bon.collaborateur.displayName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground/70 w-28 shrink-0">Email</span>
              <span>{bon.collaborateurEmail}</span>
            </div>
            {bon.collaborateur.department && (
              <div className="flex gap-2">
                <span className="text-muted-foreground/70 w-28 shrink-0">Service</span>
                <span>{bon.collaborateur.department}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Filiale & Dates</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground/70 w-28 shrink-0">Filiale</span>
              <span className="font-medium">{bon.filiale.displayName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground/70 w-28 shrink-0">Mise à dispo</span>
              <span>{formatDateLong(bon.dateMiseDisposition)}</span>
            </div>
            {bon.dateRestitution && (
              <div className="flex gap-2">
                <span className="text-muted-foreground/70 w-28 shrink-0">Restitution</span>
                <span>{formatDateLong(bon.dateRestitution)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Signatures */}
      {bon.signatures && bon.signatures.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Signatures</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {bon.signatures.filter(sig => sig.signed || new Date(sig.tokenExpiresAt).getTime() > 1000).map((sig) => (
              <div
                key={sig.id}
                className={`flex items-start gap-3 rounded-lg p-3 ${sig.signed ? 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30' : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30'}`}
              >
                {sig.signed
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  : <Clock className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />}
                <div className="flex-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{sigTypeLabel(sig.type)}</span>
                    {sig.isInPerson && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Présentiel</span>
                    )}
                    {sig.type === 'it_cachet' && (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Stamp className="h-3 w-3" /> IT
                      </span>
                    )}
                    {sig.type === 'pv_cloture' && (
                      <span className="text-xs bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> PV
                      </span>
                    )}
                  </div>
                  {sig.signed ? (
                    <div className="text-muted-foreground text-xs mt-0.5 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span>{sig.signerEmail}</span>
                      </div>
                      <div>Signé le {formatDateTime(sig.signedAt)}</div>
                      {sig.mentionLuApprouve && <div className="text-green-600">✓ Lu et approuvé</div>}
                    </div>
                  ) : (
                    <p className="text-orange-600 text-xs mt-0.5">
                      En attente · Expire le {formatDateLong(sig.tokenExpiresAt)}
                    </p>
                  )}
                </div>

                {/* Bouton PDF par étape */}
                {sig.signed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-foreground h-7 px-2"
                    onClick={() => downloadPdf(sigPdfType(sig.type), `sig-${sig.id}`)}
                    disabled={pdfLoading === `sig-${sig.id}`}
                    title={`Télécharger le PDF — ${sigTypeLabel(sig.type)}`}
                    aria-label={`Télécharger le PDF — ${sigTypeLabel(sig.type)}`}
                  >
                    {pdfLoading === `sig-${sig.id}`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                      : <Download className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Équipements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Équipements ({bon.equipments.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {bon.equipments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground/70 py-6">Aucun équipement</p>
          ) : (
            <table className="w-full text-sm" aria-label="Liste des équipements du bon">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Désignation</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">N° Série</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">N° Inventaire</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Notes</th>
                  {showEquipmentStatus && (
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Statut</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {bon.equipments.map((eq, i) => (
                  <tr key={eq.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 text-muted-foreground/70">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{equipmentLabel(eq)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {eq.serialNumber || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {eq.inventoryNumber || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{eq.notes || ''}</td>
                    {showEquipmentStatus && (
                      <td className="px-4 py-2.5">
                        {eq.returnedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Rendu
                          </span>
                        ) : eq.notReturned ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded-full" title={eq.notReturnedReason || ''}>
                            <XCircle className="h-3 w-3" /> Non rendu
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            <Clock className="h-3 w-3" /> En attente
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {bon.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Remarques</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{bon.notes}</CardContent>
        </Card>
      )}

      {/* PDF Snapshots */}
      {pdfSnapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documents PDF ({pdfSnapshots.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pdfSnapshots.map((snap) => (
              <div
                key={snap.type}
                className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {SNAPSHOT_LABELS[snap.type] || snap.type}
                  </p>
                  <p className="text-xs text-muted-foreground/70">{formatDateTime(snap.createdAt)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPdfSnapshot(snap.type, `snap-${snap.type}`)}
                  disabled={pdfLoading === `snap-${snap.type}`}
                >
                  {pdfLoading === `snap-${snap.type}`
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    : <Download className="h-3.5 w-3.5" />}
                  Télécharger
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Modal annulation */}
      {confirmCancel && (
        <ConfirmModal
          title="Annuler ce bon ?"
          message="Le bon sera marqué comme annulé. Cette action est irréversible."
          onConfirm={doCancel}
          onCancel={() => setConfirmCancel(false)}
          danger
        />
      )}

      {/* Modal présentiel (s'ouvre après le cachet IT) */}
      {inPersonModal && (
        <InPersonModal
          type={inPersonModal.type}
          token={inPersonModal.token}
          onClose={() => setInPersonModal(null)}
        />
      )}

      {/* Modal cachet IT — s'ouvre avant chaque action mise à dispo / restitution */}
      {pendingItAction && bon && (
        <ItSignModal
          bonId={bon.id}
          reference={bon.reference}
          pdfType={pendingItAction.pdfType}
          description={pendingItAction.description}
          onClose={() => setPendingItAction(null)}
          onSigned={async () => {
            setPendingItAction(null);
            await pendingItAction.onSigned();
          }}
        />
      )}

      {/* Modal restitution avec sélection d'équipements */}
      {showRestitutionModal && bon && (
        <RestitutionModal
          equipments={bon.equipments}
          onConfirm={handleRestitutionConfirm}
          onCancel={() => setShowRestitutionModal(false)}
          loading={actionLoading === 'restitution'}
        />
      )}

      {/* Modal déclarer non rendu */}
      {showNotReturnedModal && bon && (
        <DeclareNotReturnedModal
          equipments={bon.equipments}
          onConfirm={doDeclareNotReturned}
          onCancel={() => setShowNotReturnedModal(false)}
          loading={actionLoading === 'notreturned'}
        />
      )}

      {/* Modal équipement retrouvé */}
      {showMarkFoundModal && bon && (
        <MarkFoundModal
          equipments={bon.equipments}
          onConfirm={doMarkFound}
          onCancel={() => setShowMarkFoundModal(false)}
          loading={actionLoading === 'markfound'}
          isArchived={bon.status === 'archived'}
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
            onConfirm={() => doResend(true)}
            onCancel={() => setResendConfirmSentAt(null)}
          />
        );
      })()}
    </div>
  );
}
