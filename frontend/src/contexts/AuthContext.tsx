import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refetch: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async (signal?: AbortSignal) => {
    try {
      // Le jeton d'accès vit 15 min, la session 8 h : le client API rafraîchit
      // la session avant de conclure. « no-redirect » : sans session, on reste
      // ici ; c'est la garde des routes qui envoie vers la connexion, en
      // gardant l'adresse demandée (returnTo).
      const me = await api.get<User>('/auth/me', { signal, onUnauthorized: 'no-redirect' });
      setUser(me ?? null);
      setLoading(false);
    } catch (err) {
      // Requête annulée (double montage de React en mode strict, ou démontage) :
      // surtout NE PAS sortir du chargement, sinon l'application se croit
      // déconnectée une fraction de seconde et ProtectedRoute redirige vers
      // /login, d'où un retour au tableau de bord qui fait perdre l'URL
      // demandée (ouverture d'un lien direct, F5 sur une page).
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setUser(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal);
    return () => controller.abort();
  }, []);

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    window.location.href = '/login';
  };

  const value = useMemo(
    () => ({ user, loading, refetch: fetchMe, logout }),
    [user, loading],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
