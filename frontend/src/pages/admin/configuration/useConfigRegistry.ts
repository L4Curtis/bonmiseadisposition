import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { ConfigCategory } from '@/contracts/admin';
import type { ConfigRegistryEntry } from '@/contracts/config-registry';

/** Réglages d'une rubrique, par nom (« delay_1 » → entrée du registre). */
export type RegistryByName = Readonly<Record<string, ConfigRegistryEntry>>;

export interface ConfigRegistryState {
  readonly entries: RegistryByName;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

/**
 * Registre de la configuration (GET /admin/config/registry), réduit à une
 * rubrique : pour chaque réglage, la valeur saisie, la valeur par défaut et la
 * valeur réellement appliquée par le serveur.
 */
export function useConfigRegistry(category: ConfigCategory): ConfigRegistryState {
  const [entries, setEntries] = useState<RegistryByName>({});
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.getList<ConfigRegistryEntry>('/admin/config/registry');
      setEntries(Object.fromEntries(list.items.filter((e) => e.category === category).map((e) => [e.name, e])));
      setError(null);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Valeurs appliquées indisponibles'));
    }
  }, [category]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { entries, error, reload };
}
