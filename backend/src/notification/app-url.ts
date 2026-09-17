/** Variables d'environnement lues par resolveAppUrl (sous-ensemble de process.env). */
export interface AppUrlEnv {
  FRONTEND_URL?: string;
  NODE_ENV?: string;
}

/**
 * URL publique : general.app_url (base), sinon FRONTEND_URL (variable
 * d'environnement, obligatoire en production dans docker-compose) — même
 * ordre de repli que l'authentification et que la page d'administration,
 * qui pré-remplit app_url avec FRONTEND_URL. En production, seule
 * l'absence des DEUX bloque les emails à lien (erreur explicite : chaîne
 * vide retournée, à l'appelant de journaliser/bloquer). Slash final retiré
 * (évite les doubles slashes dans les liens de signature).
 *
 * Fonction pure : ne journalise rien elle-même (l'appelant décide quoi
 * faire d'une chaîne vide, ex. NotificationService.getAppUrl).
 */
export function resolveAppUrl(configValue: string | null | undefined, env: AppUrlEnv): string {
  const url = configValue || env.FRONTEND_URL;
  if (url) return url.replace(/\/+$/, '');
  if (env.NODE_ENV === 'production') return '';
  return 'http://localhost:5173';
}
