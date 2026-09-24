import { useCallback, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

/** Taille d'un lot envoyé à POST /bons/resend-batch. Le serveur accepte 10
 *  bons par appel et 10 appels par minute ; des lots de 5 gardent chaque
 *  requête courte et rendent la progression visible, sans approcher la
 *  limite (une page de 20 bons = 4 appels). */
export const RESEND_CHUNK_SIZE = 5;

export interface ResendItemResult {
  id: string;
  outcome: 'sent' | 'skipped' | 'failed';
  reason?: string;
  code?: 'token_recent';
  sentAt?: string;
}

interface ResendBatchResponse {
  results: ResendItemResult[];
}

export interface BulkResendReport {
  sent: ResendItemResult[];
  skipped: ResendItemResult[];
  failed: ResendItemResult[];
}

export interface BulkResendProgress {
  done: number;
  total: number;
}

/** Confirmation demandée par le serveur (lien envoyé il y a moins d'une heure). */
export interface RecentLinkConfirmation {
  bonId: string;
  reference: string;
  sentAt: string;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

export function toReport(results: readonly ResendItemResult[]): BulkResendReport {
  return {
    sent: results.filter((r) => r.outcome === 'sent'),
    skipped: results.filter((r) => r.outcome === 'skipped'),
    failed: results.filter((r) => r.outcome === 'failed'),
  };
}

/** Relances de liens de signature depuis la liste : un bon (même route et
 *  même confirmation que le bouton « Renvoyer le lien » de la fiche) ou une
 *  sélection (route groupée, lots successifs — jamais en parallèle). */
export function useResendLinks(onDone: () => void) {
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<RecentLinkConfirmation | null>(null);
  const [progress, setProgress] = useState<BulkResendProgress | null>(null);
  const [report, setReport] = useState<BulkResendReport | null>(null);

  const resendOne = useCallback(async (bonId: string, reference: string, force = false) => {
    setRowLoadingId(bonId);
    try {
      await api.post(`/bons/${bonId}/resend`, force ? { force: true } : undefined);
      toast({ title: 'Lien renvoyé', description: `Le lien de signature du bon ${reference} a été renvoyé.` });
      setConfirmation(null);
      onDone();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { code?: string; sentAt?: string } | undefined;
        if (body?.code === 'token_recent' && body.sentAt) {
          setConfirmation({ bonId, reference, sentAt: body.sentAt });
          return;
        }
      }
      setConfirmation(null);
      showActionError(e, 'Erreur lors du renvoi du lien');
    } finally {
      setRowLoadingId(null);
    }
  }, [onDone]);

  /** `preSkipped` : bons de la sélection écartés d'avance (non relançables),
   *  repris tels quels dans le compte rendu. */
  const resendMany = useCallback(async (
    ids: readonly string[],
    force: boolean,
    preSkipped: readonly ResendItemResult[] = [],
  ) => {
    const results: ResendItemResult[] = [];
    setReport(null);
    setProgress({ done: 0, total: ids.length });
    const chunks = chunk(ids, RESEND_CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i += 1) {
      try {
        const res = await api.post<ResendBatchResponse>('/bons/resend-batch', { ids: chunks[i], force });
        results.push(...res.results);
      } catch (e: unknown) {
        // Lot refusé en bloc (limite de requêtes, coupure réseau…) : ce lot et
        // les suivants sont comptés en échec plutôt que de s'acharner.
        const reason = errorMessage(e, 'Relance interrompue');
        const remaining = chunks.slice(i).flat();
        results.push(...remaining.map((id) => ({ id, outcome: 'failed' as const, reason })));
        break;
      } finally {
        setProgress({ done: Math.min(ids.length, results.length), total: ids.length });
      }
    }
    setProgress(null);
    setReport(toReport([...results, ...preSkipped]));
    onDone();
  }, [onDone]);

  return {
    rowLoadingId,
    confirmation,
    dismissConfirmation: () => setConfirmation(null),
    resendOne,
    progress,
    report,
    clearReport: () => setReport(null),
    resendMany,
  };
}
