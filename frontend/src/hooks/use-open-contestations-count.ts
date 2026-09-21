import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';

/** Le badge n'a pas besoin d'être temps réel : au plus un appel toutes les 30 s
 *  (rate limit 60 req/min/IP partagé avec le reste de l'application). */
const MIN_INTERVAL_MS = 30_000;

interface OpenContestationsResponse {
  openCount?: number;
}

/** Badge « contestations ouvertes » de la Sidebar. N'appelle l'API que pour un
 *  rôle IT (admin/technician) — Direction et Collaborateur n'ont de toute
 *  façon pas accès à `/contestations` côté backend. Re-déclenché à chaque
 *  changement de route, mais au plus une fois toutes les 30 s. Erreurs
 *  silencieuses : le badge disparaît simplement (`null`). */
export function useOpenContestationsCount(): number | null {
  const { user } = useAuth();
  const location = useLocation();
  const [count, setCount] = useState<number | null>(null);
  const lastFetchAtRef = useRef(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isItRole(user?.role)) {
      setCount(null);
      return;
    }

    const now = Date.now();
    if (now - lastFetchAtRef.current < MIN_INTERVAL_MS) return;
    lastFetchAtRef.current = now;

    const requestId = ++requestIdRef.current;
    api
      .get<OpenContestationsResponse>('/contestations?status=open&limit=1')
      .then((res) => {
        if (requestIdRef.current !== requestId) return; // anti-course
        setCount(typeof res.openCount === 'number' ? res.openCount : null);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setCount(null);
      });
    // fallbackMessage n'existe pas ici ; seules l'identité du rôle et la route
    // doivent redéclencher un appel (throttlé via lastFetchAtRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, location.pathname]);

  return count;
}
