import { useSearchParams } from 'react-router';
import { safeReturnTo } from '@/lib/safe-return-to';
import { SCREEN_LABELS } from '@/domain/labels';
import { usePageTitle } from '@/hooks/usePageTitle';
import { LoginCard, isCollaboratorReturnTo } from './login/LoginCard';

/** Échecs de la connexion Microsoft renvoyés par le serveur (`?error=`). */
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  entra_config_missing: "La connexion Microsoft n'est pas encore configurée. Utilisez votre adresse et votre mot de passe.",
  auth_failed: 'La connexion a échoué. Veuillez réessayer.',
  invalid_state: 'Erreur de sécurité lors de la connexion. Veuillez réessayer.',
  access_denied: 'Accès refusé par Microsoft.',
};

/**
 * Page de connexion : un seul écran clair pour tout le monde (équipe
 * informatique, direction, collaborateur), Microsoft puis le compte local
 * déjà ouvert. Seuls le titre et la phrase d'accueil changent quand on vient
 * d'un lien reçu par email (signature, « Mes équipements »).
 */
export function LoginPage() {
  usePageTitle(SCREEN_LABELS.connexion);
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get('error');
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? 'Une erreur est survenue.') : null;

  // Adresse demandée avant la connexion (lien profond, session expirée). Pour
  // Microsoft, le serveur la garde pendant l'aller-retour (cookie
  // auth_return_to) et la revalide avant d'y renvoyer.
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  if (isCollaboratorReturnTo(returnTo)) {
    return <LoginCard returnTo={returnTo} error={error} />;
  }
  return (
    <LoginCard
      returnTo={returnTo}
      error={error}
      title="Bons de mise à disposition"
      message="Connectez-vous pour continuer."
    />
  );
}
