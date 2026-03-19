import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
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
  Pen,
  Trash2,
  Stamp,
} from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignatureInfo {
  id: string;
  type: string;
  signed: boolean;
  signedAt?: string;
  signerEmail?: string;
  isInPerson: boolean;
  mentionLuApprouve: boolean;
  tokenExpiresAt: string;
}

interface BonDetail {
  id: string;
  reference: string;
  status: BonStatus;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  notes?: string;
  createdAt: string;
  collaborateur: { id: string; displayName: string; email: string; department?: string };
  collaborateurEmail: string;
  filiale: { id: string; name: string; displayName: string; address?: string; siret?: string };
  createdBy: { id: string; displayName: string; email: string };
  equipments: {
    id: string;
    catalogItem?: { id: string; brand: string; model: string; category: string };
    customLabel?: string;
    serialNumber?: string;
    inventoryNumber?: string;
    notes?: string;
    order: number;
  }[];
  signatures: SignatureInfo[];
}

/** Décrire l'action IT en attente après la signature du cachet */
interface PendingItAction {
  /** Type de PDF à générer avec ce cachet */
  pdfType: 'mise_disposition' | 'restitution';
  /** Description affichée dans la modal IT */
  description: string;
  /** Callback à appeler une fois le cachet apposé */
  onSigned: () => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Canvas hook (identique à SignaturePage) ──────────────────────────────────

function useSignatureCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const getPos = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(canvas, e.clientX, e.clientY);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    const pos = getPos(canvas, e.clientX, e.clientY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setIsEmpty(false);
  };

  const onMouseUp = () => { isDrawing.current = false; };
  const onMouseLeave = () => { isDrawing.current = false; };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touchStart = (e: TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const ctx = canvas.getContext('2d')!;
      const pos = getPos(canvas, e.touches[0].clientX, e.touches[0].clientY);
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    };
    const touchMove = (e: TouchEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const ctx = canvas.getContext('2d')!;
      ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e293b';
      const pos = getPos(canvas, e.touches[0].clientX, e.touches[0].clientY);
      ctx.lineTo(pos.x, pos.y); ctx.stroke();
      setIsEmpty(false);
    };
    const touchEnd = () => { isDrawing.current = false; };
    canvas.addEventListener('touchstart', touchStart, { passive: false });
    canvas.addEventListener('touchmove', touchMove, { passive: false });
    canvas.addEventListener('touchend', touchEnd);
    return () => {
      canvas.removeEventListener('touchstart', touchStart);
      canvas.removeEventListener('touchmove', touchMove);
      canvas.removeEventListener('touchend', touchEnd);
    };
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  }, []);

  const getDataUrl = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return null;
    return canvas.toDataURL('image/png');
  }, [isEmpty]);

  return { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave };
}

// ─── Modal : confirmation simple (annulation uniquement) ──────────────────────

function ConfirmModal({
  title, message, onConfirm, onCancel, danger,
}: { title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
          <Button size="sm" className={danger ? 'bg-red-600 hover:bg-red-700 text-white' : ''} onClick={onConfirm}>
            Confirmer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : lien présentiel ──────────────────────────────────────────────────

function InPersonModal({
  type, token, onClose,
}: { type: 'mise_disposition' | 'restitution'; token: string; onClose: () => void }) {
  const signerUrl = `${window.location.origin}/signer/${token}`;
  const typLabel = type === 'restitution' ? 'restitution' : 'mise à disposition';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-slate-900">Signature présentielle</h3>
        </div>
        <p className="text-sm text-slate-600">
          Demandez au collaborateur de scanner ce QR code ou ouvrez le lien sur votre écran pour qu'il signe la {typLabel}.
        </p>
        <div className="bg-slate-50 rounded-lg p-3 break-all text-xs font-mono text-slate-600 border">
          {signerUrl}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => navigator.clipboard.writeText(signerUrl)}>
            Copier le lien
          </Button>
          <Button size="sm" className="flex-1" onClick={() => window.open(signerUrl, '_blank')}>
            Ouvrir
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>Fermer</Button>
      </div>
    </div>
  );
}

// ─── Modal : cachet IT ────────────────────────────────────────────────────────

function ItSignModal({
  bonId, reference, pdfType, description, onClose, onSigned,
}: {
  bonId: string;
  reference: string;
  pdfType: 'mise_disposition' | 'restitution';
  description: string;
  onClose: () => void;
  onSigned: () => Promise<void>;
}) {
  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } =
    useSignatureCanvas();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const dataUrl = getDataUrl();
    if (!dataUrl) { setError('Veuillez tracer votre signature avant de valider.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/bons/${bonId}/sign-it`, { signatureDataUrl: dataUrl, pdfType });
      await onSigned();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors de la signature IT');
      setSubmitting(false);
    }
  };

  const typLabel = pdfType === 'restitution' ? 'restitution' : 'mise à disposition';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden">
        <div className="bg-slate-800 px-5 py-4 flex items-center gap-3">
          <Stamp className="h-5 w-5 text-slate-300" />
          <div>
            <h3 className="font-semibold text-white text-sm">Cachet du service informatique</h3>
            <p className="text-slate-400 text-xs">
              {typLabel.charAt(0).toUpperCase() + typLabel.slice(1)} · <span className="font-mono">{reference}</span>
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">{description}</p>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                Votre signature / cachet
              </label>
              <button onClick={clear} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                <Trash2 className="h-3 w-3" /> Effacer
              </button>
            </div>
            <div className="relative border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 hover:border-blue-300 transition-colors touch-none">
              <canvas
                ref={canvasRef}
                width={600}
                height={150}
                className="w-full cursor-crosshair block"
                style={{ touchAction: 'none' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
              />
              {isEmpty && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="text-slate-300 text-sm select-none">Signez ici…</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-slate-800 hover:bg-slate-900 text-white"
              onClick={handleSubmit}
              disabled={submitting || isEmpty}
            >
              {submitting
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> En cours…</>
                : <><Pen className="h-3.5 w-3.5" /> Apposer et continuer</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function BonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [bon, setBon] = useState<BonDetail | null>(null);
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

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api.get<BonDetail>(`/bons/${id}`)
      .then(setBon)
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

  const doRestitution = async () => {
    setActionLoading('restitution');
    try {
      await api.post(`/bons/${id}/initiate-restitution`);
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

  const doResend = async () => {
    setActionLoading('resend');
    try {
      await api.post(`/bons/${id}/resend`);
      alert('Lien de signature renvoyé avec succès');
    } catch (e: any) {
      alert(e?.message ?? 'Erreur lors du renvoi');
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
    triggerWithItSign(
      'restitution',
      'Apposez votre cachet pour confirmer la restitution des équipements. L\'email sera ensuite envoyé au collaborateur.',
      doRestitution,
    );
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
      alert('Erreur lors de la génération du PDF');
    } finally { setPdfLoading(null); }
  };

  const headerPdfType = (): 'mise_disposition' | 'restitution' => {
    if (!bon) return 'mise_disposition';
    return ['archived', 'sent_restitution'].includes(bon.status) ? 'restitution' : 'mise_disposition';
  };

  // ── Rendu ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!bon) {
    return (
      <div className="text-center py-16 text-slate-400">
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
  const isCancellable = !['archived', 'cancelled'].includes(bon.status);
  const isItStaff = currentUser?.isItStaff ?? false;
  const isSentWaiting = ['sent_mise_dispo', 'sent_restitution'].includes(bon.status);

  const sigTypeLabel = (type: string) => {
    if (type === 'mise_disposition') return 'Mise à disposition';
    if (type === 'restitution') return 'Restitution';
    if (type === 'it_cachet') return 'Cachet IT';
    return type;
  };

  const sigPdfType = (sigType: string): 'mise_disposition' | 'restitution' =>
    sigType === 'restitution' ? 'restitution' : 'mise_disposition';

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/bons')} className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono text-slate-900">{bon.reference}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${BON_STATUS_COLORS[bon.status]}`}>
                {BON_STATUS_LABELS[bon.status]}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Créé le {formatDate(bon.createdAt)} par {bon.createdBy.displayName}
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
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
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

          {isActive && (
            <>
              {/* Initier restitution — IT signe, puis email part */}
              <Button
                size="sm"
                variant="outline"
                onClick={isItStaff ? handleItRestitutionClick : () => doRestitution()}
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
            </>
          )}

          {/* Renvoyer le lien — disponible pour IT quand le bon est en attente de signature */}
          {isSentWaiting && isItStaff && (
            <Button
              variant="outline"
              size="sm"
              onClick={doResend}
              disabled={!!actionLoading}
              title="Régénère un nouveau token et renvoie l'email de signature au collaborateur"
            >
              {actionLoading === 'resend'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
              Renvoyer le lien
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
              <span className="text-slate-400 w-28 shrink-0">Nom</span>
              <span className="font-medium">{civiliteLabel} {bon.collaborateur.displayName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-28 shrink-0">Email</span>
              <span>{bon.collaborateurEmail}</span>
            </div>
            {bon.collaborateur.department && (
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">Service</span>
                <span>{bon.collaborateur.department}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Filiale & Dates</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-400 w-28 shrink-0">Filiale</span>
              <span className="font-medium">{bon.filiale.displayName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-28 shrink-0">Mise à dispo</span>
              <span>{formatDate(bon.dateMiseDisposition)}</span>
            </div>
            {bon.dateRestitution && (
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">Restitution</span>
                <span>{formatDate(bon.dateRestitution)}</span>
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
            {bon.signatures.map((sig) => (
              <div
                key={sig.id}
                className={`flex items-start gap-3 rounded-lg p-3 ${sig.signed ? 'bg-green-50 border border-green-100' : 'bg-orange-50 border border-orange-100'}`}
              >
                {sig.signed
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  : <Clock className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />}
                <div className="flex-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{sigTypeLabel(sig.type)}</span>
                    {sig.isInPerson && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Présentiel</span>
                    )}
                    {sig.type === 'it_cachet' && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Stamp className="h-3 w-3" /> IT
                      </span>
                    )}
                  </div>
                  {sig.signed ? (
                    <div className="text-slate-500 text-xs mt-0.5 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span>{sig.signerEmail}</span>
                      </div>
                      <div>Signé le {formatDateTime(sig.signedAt)}</div>
                      {sig.mentionLuApprouve && <div className="text-green-600">✓ Lu et approuvé</div>}
                    </div>
                  ) : (
                    <p className="text-orange-600 text-xs mt-0.5">
                      En attente · Expire le {formatDate(sig.tokenExpiresAt)}
                    </p>
                  )}
                </div>

                {/* Bouton PDF par étape */}
                {sig.signed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-slate-500 hover:text-slate-800 h-7 px-2"
                    onClick={() => downloadPdf(sigPdfType(sig.type), `sig-${sig.id}`)}
                    disabled={pdfLoading === `sig-${sig.id}`}
                    title={`Télécharger le PDF — ${sigTypeLabel(sig.type)}`}
                  >
                    {pdfLoading === `sig-${sig.id}`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
            <p className="text-center text-sm text-slate-400 py-6">Aucun équipement</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">Désignation</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">N° Série</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">N° Inventaire</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {bon.equipments.map((eq, i) => {
                  const label = eq.catalogItem
                    ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
                    : eq.customLabel || '—';
                  return (
                    <tr key={eq.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium">{label}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {eq.serialNumber || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {eq.inventoryNumber || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{eq.notes || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {bon.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Remarques</CardTitle></CardHeader>
          <CardContent className="text-sm text-slate-600">{bon.notes}</CardContent>
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
    </div>
  );
}
