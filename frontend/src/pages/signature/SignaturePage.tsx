import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Loader2, Pen, Trash2, FileText, Ban, AlertOctagon } from 'lucide-react';
import { useSignatureCanvas } from '@/hooks/use-signature-canvas';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/utils';
import type { User } from '@/types';

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
  status: 'pending' | 'already_signed' | 'expired' | 'replaced' | 'unauthorized' | 'cancelled' | 'contested';
  /** Référence seule pour les statuts non-pending (payload minimal côté backend) */
  reference?: string;
  /** Ajouté par le lot backend (lot B) au payload minimal 'already_signed'
   *  pour permettre un vrai téléchargement — absent aujourd'hui, lu
   *  défensivement (fallback : lien vers /mes-bons). */
  bonId?: string;
  bon?: BonInfo;
  signature?: {
    id: string;
    type: string;
    signed: boolean;
    signedAt?: string;
    signerEmail?: string;
    isInPerson: boolean | null;
    tokenExpiresAt: string;
    /** Champ backend potentiellement ajouté plus tard — absent de la réponse
     *  actuelle : on le lit défensivement pour distinguer une signature
     *  recueillie par un mandataire IT (le compte connecté fait foi en attendant). */
    signedByProxy?: boolean;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Comparaison d'origine plutôt qu'un simple test de préfixe "/" : une regex
// du type /^\/[^/]/ laisse passer des payloads comme "/\evil.com",
// "/%09/evil.com" ou "/%0a/evil.com" que le navigateur normalise en URL
// absolue vers un autre host au moment de l'assignation à
// window.location.href (open redirect). Dupliquée dans Login.tsx : pas de
// lib/** partagée dans le périmètre de ce lot. Utilisée ici en défense en
// profondeur sur '/signer/' + token (token = segment d'URL non validé).
function isSafeReturnTo(v: string): boolean {
  try {
    const u = new URL(v, window.location.origin);
    return u.origin === window.location.origin && v.startsWith('/');
  } catch {
    return false;
  }
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

const POPUP_BLOCKED_MESSAGE = 'Autorisez les fenêtres pop-up pour ce site pour afficher ce document.';
/** Repli si l'évènement `load` de l'onglet ne se déclenche pas (rendu PDF
 *  natif selon le navigateur) — on ne veut pas garder l'URL objet en mémoire
 *  indéfiniment. */
const REVOKE_FALLBACK_DELAY_MS = 60_000;

/** Charge le blob récupéré via `fetchBlob` dans l'onglet `win` (déjà ouvert
 *  de façon SYNCHRONE par l'appelant, avant tout `await`, pour ne pas être
 *  bloqué par les bloqueurs de popups). Révoque l'URL objet une fois l'onglet
 *  chargé, ou après un délai en repli si l'évènement ne se déclenche pas.
 *  Retourne un message d'erreur à afficher à l'utilisateur, ou `null` en cas
 *  de succès. */
async function loadBlobIntoTab(win: Window, fetchBlob: () => Promise<Blob>): Promise<string | null> {
  try {
    const blob = await fetchBlob();
    const url = URL.createObjectURL(blob);
    const revoke = () => URL.revokeObjectURL(url);
    win.addEventListener('load', revoke, { once: true });
    setTimeout(revoke, REVOKE_FALLBACK_DELAY_MS);
    win.location.href = url;
    return null;
  } catch (e: unknown) {
    win.close();
    return errorMessage(e, 'Impossible de charger le document.');
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SignaturePage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SignatureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [luApprouve, setLuApprouve] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } = useSignatureCanvas();

  // Cible de retour post-connexion, validée par comparaison d'origine (token
  // = segment d'URL non contrôlé par le serveur avant ce point).
  const signerPath = `/signer/${token}`;
  const safeSignerReturnTo = isSafeReturnTo(signerPath) ? signerPath : null;
  const signerReturnToQuery = safeSignerReturnTo ? `?returnTo=${encodeURIComponent(safeSignerReturnTo)}` : '';

  // Aperçu du document PDF exact qui sera signé (chaîne de preuve).
  // Ouverture SYNCHRONE dans le handler de clic : un window.open après un
  // await serait bloqué par les bloqueurs de popups (Safari iOS notamment —
  // le cas nominal d'un collaborateur sur mobile). On n'utilise pas
  // `noopener` ici car cela empêcherait de récupérer une référence à
  // l'onglet pour y injecter l'URL du blob une fois téléchargé ; on coupe
  // manuellement `opener` juste après pour conserver l'isolation.
  const handlePreview = async () => {
    setPreviewError(null);
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    if (!win) {
      setPreviewError(POPUP_BLOCKED_MESSAGE);
      return;
    }
    const err = await loadBlobIntoTab(win, () => api.getBlob(`/signature/${token}/preview`));
    if (err) setPreviewError(err);
  };

  // Téléchargement du document signé — même stratégie que l'aperçu (onglet
  // ouvert de façon synchrone, rempli une fois le blob récupéré). `stage`
  // omis (ex : lien 'already_signed' minimal, type de signature inconnu) →
  // le backend sert le meilleur snapshot disponible (défaut mise_disposition).
  const handleDownloadSigned = async (bonId: string, stage?: string) => {
    setDownloadError(null);
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    if (!win) {
      setDownloadError(POPUP_BLOCKED_MESSAGE);
      return;
    }
    const path = stage ? `/bons/${bonId}/pdf?stage=${stage}` : `/bons/${bonId}/pdf`;
    const err = await loadBlobIntoTab(win, () => api.getBlob(path));
    if (err) setDownloadError(err);
  };

  // ── 1. Check current session first ──
  // Réplique le pattern de AuthContext.fetchMe : on tente un refresh sur 401
  // AVANT de conclure à une session absente (le cookie d'accès ne vit que
  // 15 min, le refresh token 8 h) — avec un fetch manuel plutôt que api.ts,
  // dont le refresh redirige TOUTE la page vers /login en cas d'échec. Ce
  // comportement est voulu sur les pages internes, mais pas ici : un
  // collaborateur qui n'est simplement jamais connecté (cas nominal en
  // cliquant le lien reçu par email) doit voir l'écran « Connexion requise »
  // de cette page, pas être redirigé en dur vers l'écran de connexion générique.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        let res = await fetch('/api/auth/me', { credentials: 'include', signal: controller.signal });
        if (res.status === 401) {
          const refreshed = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            signal: controller.signal,
          });
          if (refreshed.ok) {
            res = await fetch('/api/auth/me', { credentials: 'include', signal: controller.signal });
          }
        }
        setCurrentUser(res.ok ? await res.json() : null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setCurrentUser(null);
      } finally {
        setCheckingAuth(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // ── 2. Fetch bon info (requires auth) ──
  // api.get rafraîchit automatiquement la session sur 401 et réessaie : le
  // cookie d'accès (15 min) a largement le temps d'expirer pendant que le
  // collaborateur lit le document avant de signer.
  useEffect(() => {
    if (!token || checkingAuth || !currentUser) return;
    let cancelled = false;
    setLoading(true);
    api.get<SignatureResponse>(`/signature/${token}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e, 'Impossible de charger le document')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, checkingAuth, currentUser]);

  // ── 3. Handle SSO redirect ──
  const handleSSOLogin = () => {
    window.location.href = `/api/auth/login${signerReturnToQuery}`;
  };

  // « Changer de compte » : se déconnecter d'abord, puis forcer le
  // sélecteur de compte Microsoft (prompt=select_account) — sans le logout
  // préalable, Microsoft reconnecte silencieusement la session existante et
  // l'utilisateur retombe sur le même compte qu'il voulait quitter.
  const handleChangeAccount = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Non bloquant : même si le logout échoue, on tente quand même le
      // sélecteur de compte côté Microsoft.
    }
    const prompt = 'prompt=select_account';
    window.location.href = `/api/auth/login${signerReturnToQuery ? `${signerReturnToQuery}&${prompt}` : `?${prompt}`}`;
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
      await api.post(`/signature/${token}/sign`, { signatureDataUrl: dataUrl, mentionLuApprouve: true });
      setSigned(true);
    } catch (e: unknown) {
      // La coupure peut survenir APRÈS que le serveur a bien enregistré la
      // signature (perte de la réponse) : on revérifie l'état réel avant
      // d'afficher une erreur sous un bouton qui semblerait pourtant actif.
      try {
        const check = await api.get<SignatureResponse>(`/signature/${token}`);
        if (check.status === 'already_signed') {
          setSigned(true);
        } else {
          setSubmitError(errorMessage(e, 'Une erreur est survenue lors de la signature.'));
        }
      } catch {
        setSubmitError(errorMessage(e, 'Une erreur est survenue lors de la signature.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Un compte IT (technicien/admin) connecté sur cette page ne peut s'y
  // trouver que pour recueillir une signature en présentiel pour le compte
  // du collaborateur (mandataire) — utilisé pour adapter les CTA post-signature.
  const isItAccount = !!currentUser && (currentUser.isItStaff || currentUser.role === 'admin' || currentUser.role === 'technician');

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
          <a
            href={`/login${signerReturnToQuery}`}
            className="block text-sm text-primary hover:underline"
          >
            Connexion avec un compte local
          </a>
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

  // Contrat backend (lot B, en cours) : GET /signature/:token renverra
  // { status: 'cancelled' | 'contested', reference } AVANT le test
  // d'expiration ci-dessous — un bon annulé/contesté ne doit jamais tomber
  // dans l'écran générique « lien expiré », même si son token l'est aussi.
  // Ces deux blocs sont donc volontairement placés avant le test 'expired'.
  if (data.status === 'cancelled') {
    return (
      <StatusScreen
        icon={<Ban className="h-12 w-12 text-muted-foreground" />}
        title="Bon annulé"
        message={`Ce bon${data.reference ? ` (réf. ${data.reference})` : ''} a été annulé par le service informatique. Aucune signature n'est attendue.`}
      />
    );
  }

  if (data.status === 'contested') {
    return (
      <StatusScreen
        icon={<AlertOctagon className="h-12 w-12 text-red-400" />}
        title="Bon contesté"
        message={`Ce bon${data.reference ? ` (réf. ${data.reference})` : ''} fait l'objet d'une contestation en cours de traitement par le service informatique. Aucune signature n'est attendue.`}
      />
    );
  }

  if (data.status === 'replaced') {
    return (
      <StatusScreen
        icon={<Clock className="h-12 w-12 text-orange-400" />}
        title="Lien remplacé"
        message={`Un nouveau lien de signature vous a été envoyé${data.reference ? ` pour le bon ${data.reference}` : ''} (relance ou nouvelle demande) : ce lien-ci n'est plus valable. Ouvrez le dernier email reçu.`}
      />
    );
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
            onClick={handleChangeAccount}
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
    const bonId = data.bon.id;
    // Signature recueillie par un mandataire IT (technicien/admin connecté
    // pour signer en présentiel au nom du collaborateur) : proposer de
    // revenir à la fiche du bon plutôt qu'au portail collaborateur.
    const isProxySigned = !!data.signature.signedByProxy || isItAccount;
    return (
      <StatusScreen
        icon={<CheckCircle className="h-12 w-12 text-green-500" />}
        title="Document signé ✓"
        message={`${docLabel} (réf. ${data.bon.reference}) a bien été signé électroniquement. Un email de confirmation vous sera envoyé.`}
        success
        actions={
          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={() => handleDownloadSigned(bonId, stage)}
              className="btn-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            >
              Télécharger le document signé
            </button>
            {downloadError && <p className="text-xs text-red-600 dark:text-red-400">{downloadError}</p>}
            {isProxySigned ? (
              <a href={`/bons/${bonId}`} className="text-sm text-primary hover:underline">Retour à la fiche du bon</a>
            ) : (
              <a href="/mes-bons" className="text-sm text-primary hover:underline">Accéder à mes bons</a>
            )}
          </div>
        }
      />
    );
  }

  // Lien déjà signé précédemment. Payload minimal aujourd'hui (référence
  // seule) ; le lot B doit y ajouter `bonId` pour permettre un vrai
  // téléchargement — tant qu'il est absent, on renvoie vers le portail.
  if (data.status === 'already_signed') {
    const alreadySignedBonId = data.bonId;
    return (
      <StatusScreen
        icon={<CheckCircle className="h-12 w-12 text-green-500" />}
        title="Document déjà signé ✓"
        message={`Ce document${data.reference ? ` (réf. ${data.reference})` : ''} a déjà été signé électroniquement.`}
        success
        actions={
          <div className="flex flex-col gap-2 w-full">
            <a href="/mes-bons" className="btn-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white text-center">
              Accéder à mes bons
            </a>
            {alreadySignedBonId ? (
              <button
                type="button"
                onClick={() => handleDownloadSigned(alreadySignedBonId)}
                className="text-sm text-primary hover:underline"
              >
                Télécharger le document
              </button>
            ) : (
              <a href="/mes-bons" className="text-sm text-primary hover:underline">Télécharger le document</a>
            )}
            {downloadError && <p className="text-xs text-red-600 dark:text-red-400">{downloadError}</p>}
          </div>
        }
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

        {/* Déclarés non rendus (restitution only) — ces équipements ne
            figurent dans aucune des deux tables ci-dessus : sans cette
            section le collaborateur signe sans voir l'état complet du bon. */}
        {isRestitution && (() => {
          const declared = bon.equipments
            .filter(eq => eq.notReturned)
            .sort((a, b) => a.order - b.order);
          if (declared.length === 0) return null;
          return (
            <div className="rounded-xl bg-card border border-border shadow-sm">
              <div className="px-5 py-3 border-b">
                <h2 className="font-semibold text-sm text-foreground">
                  Déclarés non rendus ({declared.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ces équipements ont été déclarés non restitués par le service informatique et font l'objet d'un traitement séparé.
                </p>
              </div>
              <table className="w-full text-sm" aria-label="Équipements déclarés non rendus">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Désignation</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">N° Série</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Motif</th>
                  </tr>
                </thead>
                <tbody>
                  {declared.map((eq, i) => {
                    const label = eq.catalogItem
                      ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
                      : eq.customLabel || '—';
                    return (
                      <tr key={eq.id} className="border-t bg-red-50 dark:bg-red-900/10">
                        <td className="px-4 py-2 text-muted-foreground/70">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">{label}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                          {eq.serialNumber || <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-red-700 dark:text-red-400 italic">
                          {eq.notReturnedReason || '—'}
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
              {previewError && (
                <p className="text-xs text-red-600 dark:text-red-400 text-center">{previewError}</p>
              )}

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
                {/* Canvas plus haut sur mobile (ratio 2:1) pour signer au
                    doigt confortablement ; ratio d'origine à partir de sm:.
                    La résolution interne (width/height) reste fixe — seul
                    l'affichage change, sans casser le mapping des coordonnées
                    ni l'export (indépendants l'un de l'autre dans getPos). */}
                <div className="relative border-2 border-dashed border-border rounded-lg bg-muted/30 hover:border-primary/50 transition-colors touch-none aspect-[2/1] sm:aspect-[10/3]">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={300}
                    className="w-full h-full cursor-crosshair block text-foreground"
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
                Lien valide jusqu'au {formatDateTime(sig.tokenExpiresAt)}
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
      <span className="text-muted-foreground w-28 sm:w-32 shrink-0">{label}</span>
      <span className="text-foreground font-medium break-all min-w-0">{value}</span>
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
