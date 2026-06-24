import { useEffect } from 'react';

/**
 * Avertit avant de quitter la page (fermeture d'onglet, rafraîchissement,
 * navigation externe) quand `when` est vrai — évite de perdre un formulaire en
 * cours de saisie. Ne couvre pas la navigation interne SPA (react-router sans
 * data router n'expose pas de blocage fiable) ; les boutons « Annuler »
 * confirment séparément.
 */
export function useUnsavedChangesWarning(when: boolean): void {
  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);
}
