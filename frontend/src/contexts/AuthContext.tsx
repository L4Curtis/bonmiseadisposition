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
      let res = await fetch('/api/auth/me', { credentials: 'include', signal });
      // The access token only lives 15 min but the refresh token lives 8 h: on a
      // page reload after expiry, try a refresh before declaring the user logged
      // out (otherwise every reload past 15 min forces a re-login). Done with raw
      // fetch (not api.ts) to avoid its redirect-to-/login side effect here.
      if (res.status === 401) {
        const refreshed = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          signal,
        });
        if (refreshed.ok) {
          res = await fetch('/api/auth/me', { credentials: 'include', signal });
        }
      }
      setUser(res.ok ? await res.json() : null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setUser(null);
    } finally {
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
