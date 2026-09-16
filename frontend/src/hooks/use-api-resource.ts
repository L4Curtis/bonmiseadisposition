import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export interface ApiResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Charge une ressource GET avec anti-course : si deux requêtes sont en vol
 *  (changement rapide de filtre), seule la réponse de la DERNIÈRE requête émise
 *  est appliquée, même si elle revient avant une réponse plus ancienne.
 *  `path === null` désactive l'appel (ex. onglet non actif, filtre incomplet). */
export function useApiResource<T>(path: string | null, fallbackMessage: string): ApiResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (path === null) {
      requestIdRef.current += 1;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    api.get<T>(path)
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setData(result);
      })
      .catch((e: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setData(null);
        setError(errorMessage(e, fallbackMessage));
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
    // fallbackMessage est stable par appelant ; seuls path/reloadKey doivent redéclencher la requête.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { data, loading, error, reload };
}
