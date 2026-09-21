import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { EquipmentLine, SerialConflict, SerialConflictsResponse } from './types';

interface CheckedEntry {
  /** Numéro de série (normalisé) au moment de la vérification — sert à ne
   *  garder l'avertissement affiché que tant que le champ n'a pas changé
   *  depuis (sans avoir à l'effacer explicitement à chaque frappe). */
  value: string;
  conflicts: SerialConflict[];
}

/** Vérifie en fond, ligne par ligne, si un numéro de série saisi est déjà en
 *  circulation sur un autre bon — avertissement non bloquant pendant la
 *  saisie (voir /equipment/serial-conflicts, appelé aussi à la soumission).
 *  Un seul appel par sortie de champ (`checkSerial`, à appeler depuis
 *  `onBlur`), et aucun si la valeur n'a pas changé depuis la dernière
 *  vérification de cette ligne. */
export function useLiveSerialConflicts(equipments: readonly EquipmentLine[], excludeBonId?: string) {
  const [checkedByLine, setCheckedByLine] = useState<Record<string, CheckedEntry>>({});
  // Évite un appel réseau si la valeur n'a pas bougé depuis la dernière
  // vérification (tabuler dans un champ puis en ressortir sans rien taper).
  const lastCheckedRef = useRef<Record<string, string>>({});

  const checkSerial = (lineId: string, rawValue: string) => {
    const value = rawValue.trim();
    if (!value) {
      delete lastCheckedRef.current[lineId];
      setCheckedByLine((prev) => {
        if (!(lineId in prev)) return prev;
        const { [lineId]: _removed, ...rest } = prev;
        return rest;
      });
      return;
    }
    const normalized = value.toLowerCase();
    if (lastCheckedRef.current[lineId] === normalized) return;
    lastCheckedRef.current[lineId] = normalized;

    const params = new URLSearchParams({ serials: value });
    if (excludeBonId) params.set('excludeBonId', excludeBonId);
    api.get<SerialConflictsResponse>(`/equipment/serial-conflicts?${params}`)
      .then(({ items }) => {
        setCheckedByLine((prev) => ({ ...prev, [lineId]: { value: normalized, conflicts: items } }));
      })
      .catch(() => {
        // L'avertissement à la saisie est un confort — la vérification
        // bloquante à la soumission reste la garantie de fond.
      });
  };

  /** À appeler quand une ligne est retirée du formulaire : plus rien à
   *  afficher pour elle (l'id local ne sera jamais réutilisé). */
  const forgetLine = (lineId: string) => {
    delete lastCheckedRef.current[lineId];
    setCheckedByLine((prev) => {
      if (!(lineId in prev)) return prev;
      const { [lineId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  // N'affiche un conflit que si le champ contient toujours la valeur
  // vérifiée (sinon l'utilisateur a déjà modifié le numéro depuis).
  const conflictsByLineId = useMemo(() => {
    const map = new Map<string, SerialConflict[]>();
    for (const eq of equipments) {
      const entry = checkedByLine[eq._id];
      if (entry && entry.conflicts.length > 0 && entry.value === (eq.serialNumber ?? '').trim().toLowerCase()) {
        map.set(eq._id, entry.conflicts);
      }
    }
    return map;
  }, [equipments, checkedByLine]);

  return { checkSerial, forgetLine, conflictsByLineId };
}
