import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { isSafeReturnTo } from '@/lib/safe-return-to';
import type { SignatureResponse } from '../types';
import type { User } from '@/types';

export interface UseSignatureTokenReturn {
  currentUser: User | null;
  checkingAuth: boolean;
  loading: boolean;
  data: SignatureResponse | null;
  error: string | null;
  signed: boolean;
  submitting: boolean;
  submitError: string | null;
  signerReturnToQuery: string;
  isItAccount: boolean;
  submit: (signatureDataUrl: string | null, luApprouve: boolean) => Promise<void>;
  handleSSOLogin: () => void;
  handleChangeAccount: () => Promise<void>;
}

/** Charge les infos du bon associées à un token de signature, gère la
 *  vérification de session (avec refresh) préalable, et la soumission de la
 *  signature elle-même. Toute la logique réseau/état de `SignaturePage` en
 *  dehors du canvas de dessin (voir `useSignatureCanvas`, distinct car lié au
 *  DOM) et du téléchargement/aperçu du PDF (voir `useDocumentActions`). */
export function useSignatureToken(token: string | undefined): UseSignatureTokenReturn {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SignatureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  // Verrou synchrone contre le double appui : `submitting` n'est lu qu'au
  // rendu suivant, alors que deux appuis rapprochés sur un écran tactile
  // peuvent atteindre le gestionnaire avant ce rendu.
  const submittingRef = useRef(false);

  // Cible de retour post-connexion, validée par comparaison d'origine (token
  // = segment d'URL non contrôlé par le serveur avant ce point).
  const signerPath = `/signer/${token}`;
  const safeSignerReturnTo = isSafeReturnTo(signerPath) ? signerPath : null;
  const signerReturnToQuery = safeSignerReturnTo ? `?returnTo=${encodeURIComponent(safeSignerReturnTo)}` : '';

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
  const submit = async (signatureDataUrl: string | null, luApprouve: boolean) => {
    if (!signatureDataUrl || submittingRef.current) return;
    if (!luApprouve) {
      setSubmitError('Veuillez cocher "Lu et approuvé" avant de signer.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await api.post(`/signature/${token}/sign`, { signatureDataUrl, mentionLuApprouve: true });
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Un compte IT (technicien/admin) connecté sur cette page ne peut s'y
  // trouver que pour recueillir une signature en présentiel pour le compte
  // du collaborateur (mandataire) — utilisé pour adapter les CTA post-signature.
  const isItAccount = !!currentUser && (currentUser.isItStaff || currentUser.role === 'admin' || currentUser.role === 'technician');

  return {
    currentUser,
    checkingAuth,
    loading,
    data,
    error,
    signed,
    submitting,
    submitError,
    signerReturnToQuery,
    isItAccount,
    submit,
    handleSSOLogin,
    handleChangeAccount,
  };
}
