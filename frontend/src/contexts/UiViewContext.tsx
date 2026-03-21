import React, { createContext, useContext, useEffect, useState } from 'react';
import { Monitor, Shield, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

/**
 * SECURITE : Ce contexte gère uniquement l'affichage UX (navigation, vue active).
 * Il NE DOIT JAMAIS être utilisé pour des contrôles d'accès ou des guards de sécurité.
 * Les permissions réelles sont toujours vérifiées via user.role (AuthContext + backend).
 */

export type UiView = 'collaborateur' | 'technicien' | 'administrateur';

export const UI_VIEW_LABELS: Record<UiView, string> = {
  collaborateur: 'Collaborateur',
  technicien: 'Technicien IT',
  administrateur: 'Administrateur',
};

export const UI_VIEW_ICON_MAP: Record<UiView, React.ElementType> = {
  collaborateur: User,
  technicien: Monitor,
  administrateur: Shield,
};

export function getAvailableViews(role: UserRole): UiView[] {
  switch (role) {
    case 'admin': return ['collaborateur', 'technicien', 'administrateur'];
    case 'technician': return ['collaborateur', 'technicien'];
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

/** Lecture synchrone au démarrage — sans user.id, pour éviter le flash */
function readStoredView(): UiView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'collaborateur';
    const parsed: StoredPrefs = JSON.parse(raw);
    if (['collaborateur', 'technicien', 'administrateur'].includes(parsed.view)) {
      return parsed.view;
    }
  } catch {
    // localStorage indisponible ou données corrompues
  }
  return 'collaborateur';
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
  const [activeView, setActiveViewState] = useState<UiView>(readStoredView);

  // Validation une fois l'user connu : même userId ? rôle toujours compatible ?
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored: StoredPrefs = JSON.parse(raw);
        if (stored.userId !== user.id) {
          // Autre compte — reset à collaborateur (comportement intentionnel pour un nouvel utilisateur)
          setActiveViewState('collaborateur');
          savePrefs(user.id, 'collaborateur');
          return;
        }
      }
    } catch {}
    // Même utilisateur — vérifier que la vue est toujours dans ses droits
    const available = getAvailableViews(user.role);
    if (!available.includes(activeView)) {
      setActiveViewState('collaborateur');
      savePrefs(user.id, 'collaborateur');
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

  return (
    <UiViewContext.Provider value={{ activeView, setActiveView, availableViews }}>
      {children}
    </UiViewContext.Provider>
  );
}

export function useUiView() {
  return useContext(UiViewContext);
}
