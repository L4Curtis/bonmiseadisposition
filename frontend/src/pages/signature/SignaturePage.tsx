import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Loader2, Pen, Trash2, FileText } from 'lucide-react';
import { useSignatureCanvas } from '@/hooks/use-signature-canvas';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BonInfo {
  id: string;
  reference: string;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  notes?: string;
  collaborateur: { displayName: string; email: string; department?: string };
  collaborateurEmail: string;
  filiale: { name: string; displayName: string; address?: string };
  equipments: {
    id: string;
    order: number;
    catalogItem?: { brand: string; model: string; category: string };
    customLabel?: string;
    serialNumber?: string;
    inventoryNumber?: string;
    notes?: string;
    notReturned?: boolean;
    notReturnedReason?: string;
    returnedAt?: string;
  }[];
}

interface SignatureResponse {
  status: 'pending' | 'already_signed' | 'expired' | 'unauthorized';
  /** Référence seule pour les statuts non-pending (payload minimal côté backend) */
  reference?: string;
  bon?: BonInfo;
  signature?: {
    id: string;
    type: string;
    signed: boolean;
    signedAt?: string;
    signerEmail?: string;
    isInPerson: boolean | null;
    tokenExpiresAt: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SignaturePage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SignatureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ email: string; displayName: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [luApprouve, setLuApprouve] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);

  // Aperçu du document PDF exact qui sera signé (chaîne de preuve).
  // Ouverture SYNCHRONE dans le handler de clic : un window.open après un
  // await serait bloqué par les bloqueurs de popups (Safari iOS notamment —
  // le cas nominal d'un collaborateur sur mobile). Le endpoint est un GET
  // same-origin authentifié par cookie, le navigateur le charge directement.
  const handlePreview = () => {
    window.open(`/api/signature/${token}/preview`, '_blank', 'noopener');
  };

  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } = useSignatureCanvas();

  // ── 1. Check current session first ──
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCurrentUser(u))
      .finally(() => setCheckingAuth(false));
  }, []);

  // ── 2. Fetch bon info (requires auth) ──
  useEffect(() => {
    if (!token || checkingAuth || !currentUser) return;
    fetch(`/api/signature/${token}`, { credentials: 'include' })
      .then((r) => {
        if (r.status === 401) throw new Error('auth');
        if (!r.ok) throw new Error('Impossible de charger le document');
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => {
        if (e.message === 'auth') {
          // Session expirée entre le check /auth/me et cette requête :
          // re-proposer la connexion plutôt que « document introuvable »
          setCurrentUser(null);
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [token, checkingAuth, currentUser]);

  // ── 3. Handle SSO redirect ──
  const handleSSOLogin = () => {
    window.location.href = `/api/auth/login?returnTo=/signer/${token}`;
  };

  // ── 4. Submit signature ──
  const handleSubmit = async () => {
    const dataUrl = getDataUrl();
    if (!dataUrl) return;
    if (!luApprouve) {
      setSubmitError('Veuillez cocher "Lu et approuvé" avant de signer.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/signature/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ signatureDataUrl: dataUrl, mentionLuApprouve: true }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Erreur ${res.status}`);
      }

      setSigned(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Une erreur est survenue lors de la signature.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" /><span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  // Pas connecté → afficher le prompt de connexion immédiatement
  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-sm p-8 text-center space-y-4">
          <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
            <Pen className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Connexion requise</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Vous devez vous connecter avec votre compte Microsoft pour consulter et signer ce document.
            </p>
          </div>
          <button
            onClick={handleSSOLogin}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Se connecter avec Microsoft
          </button>
          <p className="text-xs text-muted-foreground/70">Groupe Livio — Service informatique</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" /><span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  if (error) {
    return <StatusScreen icon={<XCircle className="h-12 w-12 text-red-400" />} title="Lien invalide" message={error} />;
  }

  if (!data) {
    return <StatusScreen icon={<XCircle className="h-12 w-12 text-red-400" />} title="Document introuvable" message="Ce lien de signature n'existe pas." />;
  }

  if (data.status === 'expired') {
    return (
      <StatusScreen
        icon={<Clock className="h-12 w-12 text-orange-400" />}
        title="Lien expiré"
        message={`Ce lien de signature${data.reference ? ` (réf. ${data.reference})` : ''} a expiré. Contactez le service informatique pour en recevoir un nouveau.`}
      />
    );
  }

  // Le backend ne renvoie le détail du bon qu'au destinataire du lien
  if (data.status === 'unauthorized') {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-sm p-8 text-center space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
            <XCircle className="h-7 w-7 text-red-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Compte non autorisé</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ce document est destiné à un autre collaborateur. Vous êtes connecté en tant que{' '}
              <strong>{currentUser.email}</strong> — reconnectez-vous avec le compte Microsoft du destinataire.
            </p>
          </div>
          <button
            onClick={handleSSOLogin}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Changer de compte
          </button>
          <p className="text-xs text-muted-foreground/70">Groupe Livio — Service informatique</p>
        </div>
      </div>
    );
  }

  // Signature fraîchement soumise (data contient encore le payload pending complet)
  if (signed && data.bon && data.signature) {
    const sigType = data.signature.type === 'pv_cloture'
      ? 'procès-verbal d\'équipements non restitués'
      : data.signature.type === 'restitution' ? 'restitution' : 'mise à disposition';
    const docLabel = data.signature.type === 'pv_cloture' ? 'Le procès-verbal' : `Le bon de ${sigType}`;
    // Le snapshot est généré de façon synchrone à la signature → téléchargeable
    // immédiatement. On repart donc avec une copie de ce qu'on a signé.
    const stage = data.signature.type === 'restitution'
      ? 'signature_collab_restitution'
      : data.signature.type === 'pv_cloture'
        ? 'cloture_equipements_manquants'
        : 'signature_collab_mise_disposition';
    return (
      <StatusScreen
        icon={<CheckCircle className="h-12 w-12 text-green-500" />}
        title="Document signé ✓"
        message={`${docLabel} (réf. ${data.bon.reference}) a bien été signé électroniquement. Un email de confirmation vous a été envoyé.`}
        success
        actions={
          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={() => window.open(`/api/bons/${data.bon!.id}/pdf?stage=${stage}`, '_blank', 'noopener')}
              className="btn-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            >
              Télécharger le document signé
            </button>
            <a href="/mes-bons" className="text-sm text-primary hover:underline">Accéder à mes bons</a>
          </div>
        }
      />
    );
  }

  // Lien déjà signé précédemment (payload minimal : référence seule)
  if (data.status === 'already_signed') {
    return (
      <StatusScreen
        icon={<CheckCircle className="h-12 w-12 text-green-500" />}
        title="Document déjà signé ✓"
        message={`Ce document${data.reference ? ` (réf. ${data.reference})` : ''} a déjà été signé électroniquement.`}
        success
      />
    );
  }

  if (!data.bon || !data.signature) {
    return <StatusScreen icon={<XCircle className="h-12 w-12 text-red-400" />} title="Document introuvable" message="Ce lien de signature n'existe pas." />;
  }

  const bon = data.bon;
  const sig = data.signature;
  const isPvCloture = sig.type === 'pv_cloture';
  const isRestitution = sig.type === 'restitution';
  const sigType = isPvCloture
    ? 'procès-verbal d\'équipements non restitués'
    : isRestitution ? 'restitution' : 'mise à disposition';
  const civiliteLabel = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
  const isInPerson = sig.isInPerson;

  // Email mismatch warning (not blocking for in-person). trim() pour refléter
  // exactement la normalisation backend (toLowerCase().trim()) et ne pas
  // bloquer à tort un destinataire dont l'email importé a un espace parasite.
  const emailMismatch =
    currentUser && !isInPerson &&
    currentUser.email.toLowerCase().trim() !== bon.collaborateurEmail.toLowerCase().trim();

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Header card */}
        <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
          <div
            className="relative px-6 py-5 overflow-hidden"
            style={{
              background: isPvCloture
                ? 'linear-gradient(135deg, hsl(0 72% 38%), hsl(0 74% 50%))'
                : 'var(--gradient-primary)',
            }}
          >
            <div aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative">
              <p className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.14em] mb-1">
                {bon.filiale.displayName}
              </p>
              <h1 className="text-white font-bold text-lg tracking-tight">
                {isPvCloture ? 'Procès-verbal à signer' : `Bon de ${sigType} à signer`}
              </h1>
              <p className="text-white/80 text-sm font-mono mt-1">{bon.reference}</p>
            </div>
          </div>
          <div className="px-6 py-4 space-y-2 text-sm">
            <Row label="Destinataire" value={`${civiliteLabel} ${bon.collaborateur.displayName}`} />
            <Row label="Email" value={bon.collaborateurEmail} />
            {bon.collaborateur.department && <Row label="Service" value={bon.collaborateur.department} />}
            <Row label="Filiale" value={bon.filiale.displayName} />
            <Row label="Date mise à dispo" value={formatDate(bon.dateMiseDisposition)} />
            {bon.dateRestitution && <Row label="Date restitution" value={formatDate(bon.dateRestitution)} />}
          </div>
        </div>

        {/* Equipment list */}
        <EquipmentTable
          equipments={bon.equipments}
          isPvCloture={isPvCloture}
          isRestitution={isRestitution}
        />

        {/* Remaining equipment (restitution only) */}
        {isRestitution && (() => {
          const remaining = bon.equipments
            .filter(eq => !eq.returnedAt && !eq.notReturned)
            .sort((a, b) => a.order - b.order);
          if (remaining.length === 0) return null;
          return (
            <div className="rounded-xl bg-card border border-border shadow-sm">
              <div className="px-5 py-3 border-b">
                <h2 className="font-semibold text-sm text-foreground">
                  Éléments restants sur ce bon ({remaining.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ces équipements ne font pas partie de cette restitution et restent attribués.
                </p>
              </div>
              <table className="w-full text-sm" aria-label="Équipements restants">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Désignation</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">N° Série</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {remaining.map((eq, i) => {
                    const label = eq.catalogItem
                      ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
                      : eq.customLabel || '—';
                    return (
                      <tr key={eq.id} className="border-t">
                        <td className="px-4 py-2 text-muted-foreground/70">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">{label}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                          {eq.serialNumber || <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                            En service
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Signature section (user is always authenticated at this point) */}
        <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground">Votre signature</h2>
              <span className="text-xs text-muted-foreground/70">
                Connecté en tant que <strong>{currentUser!.displayName}</strong> ({currentUser!.email})
              </span>
            </div>

            {/* Email mismatch warning */}
            {emailMismatch && (
              <div role="alert" className="mx-5 mt-4 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Compte non autorisé</p>
                  <p className="text-xs mt-0.5">
                    Ce document est destiné à <strong>{bon.collaborateurEmail}</strong>. Vous êtes connecté avec <strong>{currentUser.email}</strong>. Veuillez vous connecter avec le bon compte Microsoft.
                  </p>
                </div>
              </div>
            )}

            {isPvCloture && (
              <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
                <div>
                  <p className="font-medium">Procès-verbal d'équipements non restitués</p>
                  <p className="text-xs mt-0.5">
                    Ce document atteste que les équipements listés ci-dessus n'ont pas été restitués. Votre signature confirme que vous avez pris connaissance de ce procès-verbal.
                  </p>
                </div>
              </div>
            )}
            {isInPerson && !isPvCloture && (
              <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 p-3 text-sm text-amber-700 dark:text-amber-400">
                <div>
                  <p className="font-medium">Signature présentielle</p>
                  <p className="text-xs mt-0.5">
                    Cette signature est réalisée en présence du technicien informatique. Signez ci-dessous pour confirmer la {sigType} du matériel.
                  </p>
                </div>
              </div>
            )}

            <div className="p-5 space-y-4">
              {/* Aperçu du document exact qui sera signé */}
              <button
                type="button"
                onClick={handlePreview}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted/60 transition-colors"
              >
                <FileText className="h-4 w-4" />
                Voir le document qui sera signé (PDF)
              </button>

              {/* Canvas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tracez votre signature ci-dessous
                  </label>
                  <button
                    onClick={clear}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Effacer
                  </button>
                </div>
                <div className="relative border-2 border-dashed border-border rounded-lg bg-muted/30 hover:border-primary/50 transition-colors touch-none">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={180}
                    className="w-full cursor-crosshair block text-foreground"
                    style={{ touchAction: 'none' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseLeave}
                  />
                  {isEmpty && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <p className="text-muted-foreground/40 text-sm select-none">Signez ici...</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Lu et approuvé */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={luApprouve}
                  onChange={(e) => setLuApprouve(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                />
                <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                  {isPvCloture ? (
                    <><strong>Lu et approuvé</strong> — Je reconnais avoir pris connaissance du présent procès-verbal d'équipements non restitués. Je comprends que cette signature électronique a valeur contractuelle.</>
                  ) : (
                    <><strong>Lu et approuvé</strong> — Je reconnais avoir pris connaissance de la liste des équipements ci-dessus et en confirme la {sigType}. Je comprends que cette signature électronique a valeur contractuelle.</>
                  )}
                </span>
              </label>

              {/* Error */}
              {submitError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting || isEmpty || !luApprouve || (!!(!isInPerson && !isPvCloture && emailMismatch))}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99] ${isPvCloture ? 'bg-red-700 hover:bg-red-800 shadow-sm' : 'btn-gradient'}`}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Signature en cours…</>
                ) : isPvCloture ? (
                  <><Pen className="h-4 w-4" /> Signer le procès-verbal</>
                ) : (
                  <><Pen className="h-4 w-4" /> Signer le bon de {sigType}</>
                )}
              </button>

              <p className="text-center text-xs text-muted-foreground/70">
                Lien valide jusqu'au {formatDate(sig.tokenExpiresAt)}
              </p>
            </div>
          </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/60 pb-4">
          Groupe Livio — Service informatique · Signature électronique sécurisée
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function EquipmentTable({
  equipments,
  isPvCloture,
  isRestitution,
}: {
  equipments: BonInfo['equipments'];
  isPvCloture: boolean;
  isRestitution: boolean;
}) {
  // Copy before sorting — sort() mutates in place and the array lives in the
  // parent component's state
  const filtered = [...equipments]
    .sort((a, b) => a.order - b.order)
    .filter(eq => {
      if (isPvCloture) return eq.notReturned;
      if (isRestitution) return !!eq.returnedAt;
      return true;
    });

  return (
    <div className="rounded-xl bg-card border border-border shadow-sm">
      <div className="px-5 py-3 border-b">
        <h2 className="font-semibold text-sm text-foreground">
          {isPvCloture
            ? `Équipements non restitués (${filtered.length})`
            : isRestitution
              ? `Équipements restitués (${filtered.length})`
              : `Équipements (${filtered.length})`}
        </h2>
        {isPvCloture && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Les équipements ci-dessous ont été déclarés non restitués par le service informatique.
          </p>
        )}
        {isRestitution && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Les équipements ci-dessous sont en cours de restitution.
          </p>
        )}
      </div>
      <table className="w-full text-sm" aria-label="Liste des équipements">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Désignation</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">N° Série</th>
            {isPvCloture && <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Motif</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.map((eq, i) => {
            const label = eq.catalogItem
              ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
              : eq.customLabel || '—';
            return (
              <tr key={eq.id} className={`border-t ${isPvCloture ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                <td className="px-4 py-2 text-muted-foreground/70">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{label}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {eq.serialNumber || <span className="text-muted-foreground/30">—</span>}
                </td>
                {isPvCloture && (
                  <td className="px-4 py-2 text-xs text-red-700 italic">
                    {eq.notReturnedReason || '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusScreen({
  icon,
  title,
  message,
  success,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  success?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-muted'}`}>
          {icon}
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {actions && <div className="pt-2">{actions}</div>}
        <p className="text-xs text-muted-foreground/70">Groupe Livio — Service informatique</p>
      </div>
    </div>
  );
}
