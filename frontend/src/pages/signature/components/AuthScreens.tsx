import { XCircle } from 'lucide-react';
import { LoginCard } from '@/pages/login/LoginCard';
import type { User } from '@/types';

interface LoginRequiredScreenProps {
  /** Adresse de la page de signature, où revenir une fois connecté. */
  signerReturnTo: string | null;
}

/** Pas connecté : on se connecte ici même, sans changer d'écran, puis on
 *  revient droit au document (R-096). */
export function LoginRequiredScreen({ signerReturnTo }: LoginRequiredScreenProps) {
  return (
    <LoginCard
      returnTo={signerReturnTo}
      message="Connectez-vous pour consulter et signer ce document."
    />
  );
}

interface UnauthorizedScreenProps {
  currentUser: User;
  onChangeAccount: () => void;
}

export function UnauthorizedScreen({ currentUser, onChangeAccount }: UnauthorizedScreenProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-6">
      <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-sm p-8 text-center space-y-4">
        <div className="bg-destructive/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
          <XCircle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Compte non autorisé</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ce document est destiné à un autre collaborateur. Vous êtes connecté en tant que{' '}
            <strong>{currentUser.email}</strong> — reconnectez-vous avec le compte Microsoft du destinataire.
          </p>
        </div>
        <button
          onClick={onChangeAccount}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Changer de compte
        </button>
        <p className="text-xs text-muted-foreground/70">Groupe Livio — Équipe informatique</p>
      </div>
    </div>
  );
}
