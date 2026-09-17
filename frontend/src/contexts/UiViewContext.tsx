import React, { createContext, useContext, useEffect, useState } from 'react';
import { BarChart3, Monitor, Shield, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

/**
 * SECURITE : Ce contexte gère uniquement l'affichage UX (navigation, vue active).
 * Il NE DOIT JAMAIS être utilisé pour des contrôles d'accès ou des guards de sécurité.
 * Les permissions réelles sont toujours vérifiées via user.role (AuthContext + backend).
 */

export type UiView = 'collaborateur' | 'technicien' | 'administrateur' | 'direction';

const ALL_UI_VIEWS: UiView[] = ['collaborateur', 'technicien', 'administrateur', 'direction'];

export const UI_VIEW_LABELS: Record<UiView, string> = {
  collaborateur: 'Collaborateur',
  technicien: 'Technicien IT',
  administrateur: 'Administrateur',
  direction: 'Direction',
};

export const UI_VIEW_ICON_MAP: Record<UiView, React.ElementType> = {
  collaborateur: User,
  technicien: Monitor,
  administrateur: Shield,
  direction: BarChart3,
};

export function getAvailableViews(role: UserRole): UiView[] {
  switch (role) {
    case 'admin': return ['collaborateur', 'technicien', 'administrateur'];
    case 'technician': return ['collaborateur', 'technicien'];
    case 'direction': return ['direction'];
    default: return ['collaborateur'];
  }
}

interface UiViewContextValue {
  activeView: UiView;
  setActiveView: (view: UiView) => void;
  availableViews: UiView[];
}

const UiViewContext = createContext<UiViewContextValue>({
  activeView: 'collaborateur',
  setActiveView: () => {},
  availableViews: ['collaborateur'],
});

const STORAGE_KEY = 'uiView:prefs';

interface StoredPrefs {
  userId: string;
  view: UiView;
}

/** Vue par défaut d'un rôle : la plus élevée qu'il peut prendre (un admin
 *  arrive sur la vue administrateur, un technicien sur la vue technicien). */
export function defaultViewFor(views: readonly UiView[]): UiView {
  return views[views.length - 1] ?? 'collaborateur';
}

/** Lecture synchrone au démarrage — sans user.id, pour éviter le flash.
 *  `null` = aucune préférence enregistrée sur ce navigateur. */
function readStoredView(): UiView | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredPrefs = JSON.parse(raw);
    if (ALL_UI_VIEWS.includes(parsed.view)) {
      return parsed.view;
    }
  } catch {
    // localStorage indisponible ou données corrompues
  }
  return null;
}

function savePrefs(userId: string, view: UiView): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, view }));
  } catch {}
}

export function UiViewProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const availableViews: UiView[] = user ? getAvailableViews(user.role) : ['collaborateur'];

  // Initialisation synchrone depuis localStorage — pas de flash au chargement
  const [activeView, setActiveViewState] = useState<UiView | null>(readStoredView);

  // Validation une fois l'user connu : même userId ? rôle toujours compatible ?
  useEffect(() => {
    if (!user) return;
    const defaultView = defaultViewFor(availableViews);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Première visite sur ce navigateur : vue la plus élevée du rôle
        setActiveViewState(defaultView);
        savePrefs(user.id, defaultView);
        return;
      }
      if (raw) {
        const stored: StoredPrefs = JSON.parse(raw);
        if (stored.userId !== user.id) {
          // Autre compte — reset à la vue par défaut du rôle (comportement
          // intentionnel pour un nouvel utilisateur)
          setActiveViewState(defaultView);
          savePrefs(user.id, defaultView);
          return;
        }
      }
    } catch {}
    // Même utilisateur — vérifier que la vue est toujours dans ses droits
    if (!activeView || !availableViews.includes(activeView)) {
      setActiveViewState(defaultView);
      savePrefs(user.id, defaultView);
    } else {
      // Ancrer userId dans les prefs (cas premier login sans userId stocké)
      savePrefs(user.id, activeView);
    }
  }, [user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveView = (view: UiView) => {
    if (availableViews.includes(view)) {
      setActiveViewState(view);
      if (user) savePrefs(user.id, view);
    }
  };

  // La valeur restaurée du localStorage peut appartenir à un autre compte ou à
  // un rôle supérieur : clamp synchrone dès que l'user est connu, pour que le
  // premier rendu ne redirige pas un non-IT vers /unauthorized (le useEffect
  // ci-dessus corrige le storage ensuite).
  const effectiveView: UiView = user
    ? activeView && availableViews.includes(activeView) ? activeView : defaultViewFor(availableViews)
    : activeView ?? 'collaborateur';

  return (
    <UiViewContext.Provider value={{ activeView: effectiveView, setActiveView, availableViews }}>
      {children}
    </UiViewContext.Provider>
  );
}

export function useUiView() {
  return useContext(UiViewContext);
}
