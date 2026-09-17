import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { errorMessage, showActionError } from '@/lib/errors';
import type { BonDetailData, NotificationLog, PdfSnapshotInfo } from '../types';

/** Chargement du bon, de ses snapshots PDF et de ses journaux de
 *  notification. Isolé de useBonActions pour séparer le fetch/rafraîchissement
 *  des actions métier proprement dites (envoi, restitution, clôture...). */
export function useBonLoadState(id: string | undefined, isItStaff: boolean) {
  const [bon, setBon] = useState<BonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  // Rafraîchissement après une action (distinct du chargement initial) : ne
  // vide jamais la page ni les modales ouvertes (ex. présentiel) le temps du
  // re-fetch — contrairement à `loading`, qui affiche un spinner plein écran.
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfSnapshots, setPdfSnapshots] = useState<PdfSnapshotInfo[]>([]);
  // Types de snapshot attendus mais absents. Contrat backend confirmé : GET
  // /bons/:id/pdf-snapshots reste un tableau (le portail collaborateur en
  // dépend, ne pas le changer) ; la liste des manquants vit sur une route
  // séparée GET /bons/:id/pdf-snapshots/missing → { missing: string[] },
  // appelée uniquement pour l'IT (voir `isItStaff` ci-dessus).
  const [missingSnapshots, setMissingSnapshots] = useState<string[]>([]);
  const [regeneratingSnapshots, setRegeneratingSnapshots] = useState(false);
  const [notifLogs, setNotifLogs] = useState<NotificationLog[]>([]);

  const snapshotRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending snapshot re-fetch when the page unmounts
  useEffect(() => () => {
    if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current);
  }, []);

  const loadSnapshots = (bonId: string) => {
    api.get<PdfSnapshotInfo[]>(`/bons/${bonId}/pdf-snapshots`)
      .then(setPdfSnapshots)
      .catch(() => setPdfSnapshots([]));

    // Route séparée, IT uniquement : un collaborateur consultant son bon
    // via le portail n'a aucun intérêt (ni droit) à connaître les documents
    // manquants, et cet appel ne doit donc pas partir depuis ce contexte.
    if (isItStaff) {
      api.get<{ missing: string[] }>(`/bons/${bonId}/pdf-snapshots/missing`)
        .then((r) => setMissingSnapshots(r.missing ?? []))
        .catch(() => setMissingSnapshots([]));
    } else {
      setMissingSnapshots([]);
    }
  };

  /** Admin uniquement — régénère les PdfSnapshot manquants pour les
   *  signatures déjà signées. Opération globale côté backend (aucun
   *  paramètre : POST /admin/pdf/regenerate-missing, voir
   *  backend/src/pdf/pdf-admin.controller.ts), pas limitée à ce bon — on
   *  recharge simplement les snapshots de ce bon une fois lancée. */
  const regenerateMissingSnapshots = async () => {
    if (!id) return;
    setRegeneratingSnapshots(true);
    try {
      await api.post('/admin/pdf/regenerate-missing');
      toast({ title: 'Régénération lancée', description: 'Les documents manquants vont être régénérés.' });
      loadSnapshots(id);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la régénération des documents');
    } finally {
      setRegeneratingSnapshots(false);
    }
  };

  const loadNotifLogs = (bonId: string) => {
    api.get<NotificationLog[]>(`/bons/${bonId}/notifications`)
      .then(setNotifLogs)
      .catch(() => setNotifLogs([]));
  };

  /** Chargement du bon. `initial` pilote QUEL indicateur de chargement est
   *  utilisé : plein écran (`loading`) au premier montage, discret
   *  (`refreshing`) après une action — pour ne pas vider la page ni fermer
   *  les modales pendant un simple rafraîchissement. */
  const fetchBon = (initial: boolean) => {
    if (initial) setLoading(true); else setRefreshing(true);
    setLoadError(null);
    // Annuler un éventuel retry en cours
    if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current);
    return api.get<BonDetailData>(`/bons/${id}`)
      .then((b) => {
        setBon(b);
        loadSnapshots(b.id);
        loadNotifLogs(b.id);
        // Re-fetch snapshots après 2s pour capter les PDF générés en async
        snapshotRetryRef.current = setTimeout(() => loadSnapshots(b.id), 2000);
      })
      .catch((e: unknown) => setLoadError(errorMessage(e, 'Erreur lors du chargement du bon')))
      .finally(() => { if (initial) setLoading(false); else setRefreshing(false); });
  };

  /** Chargement initial (plein écran). */
  const load = () => fetchBon(true);
  /** Rafraîchissement après une action (discret). */
  const reload = () => fetchBon(false);

  return {
    bon,
    loading,
    refreshing,
    loadError,
    pdfSnapshots,
    missingSnapshots,
    regeneratingSnapshots,
    notifLogs,
    load,
    reload,
    regenerateMissingSnapshots,
  };
}
