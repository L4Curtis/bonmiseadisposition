import { useNavigate, useParams } from 'react-router';
import { Boxes, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { Pagination } from '@/components/list';
import { useMaterielHistory } from './useMaterielHistory';
import { MaterielHistoryHeader } from './MaterielHistoryHeader';
import { MaterielHistoryList } from './MaterielHistoryList';
import { currentHolderStatus, decodeReferenceParam } from './types';

/**
 * Page /materiel/:reference (lot L1 — A3) : historique complet d'un matériel,
 * identifié par son n° de série OU son n° d'inventaire. Remplace l'ancienne
 * modale SerialHistoryModal, accessible uniquement depuis la fiche d'un bon —
 * ici, une adresse partageable, accessible depuis n'importe quel endroit où
 * le numéro s'affiche (inventaire, fiche de bon).
 */
export function MaterielHistoryPage() {
  const { reference: encodedReference } = useParams<{ reference: string }>();
  const reference = decodeReferenceParam(encodedReference);
  const navigate = useNavigate();
  const { user } = useAuth();
  // Direction : lecture seule, aucun accès aux bons individuels (même règle
  // que l'inventaire — voir canLinkToBon dans pages/Inventaire.tsx).
  const canLinkToBon = isItRole(user?.role);

  const { history, latestEntries, loading, error, pagination } = useMaterielHistory(reference);

  // Le premier chargement occupe la page ; un changement de page garde la
  // liste affichée le temps de la réponse.
  if (loading && !history) {
    return (
      <div className="flex justify-center py-16" aria-live="polite">
        <div
          className="h-7 w-7 animate-spin motion-reduce:animate-none rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent"
          role="status"
        >
          <span className="sr-only">Chargement de l'historique</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 text-muted-foreground/70" role="alert">
        <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive/70" />
        <p className="text-destructive">{error}</p>
        <button className="mt-3 text-primary text-sm hover:underline" onClick={() => navigate(-1)}>
          Retour
        </button>
      </div>
    );
  }

  const entries = history?.items ?? [];
  const latest = latestEntries[0] ?? entries[0];

  if (!latest) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Boxes className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground/80 mb-1">
          Aucun bon ne référence <span className="font-mono">{reference}</span>
        </p>
        <p className="text-xs text-muted-foreground/70 max-w-xs">
          Vérifiez le numéro de série ou d'inventaire saisi.
        </p>
        <button className="mt-3 text-primary text-sm hover:underline" onClick={() => navigate(-1)}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MaterielHistoryHeader
        reference={reference}
        label={latest.label ?? '—'}
        status={currentHolderStatus(latestEntries.length > 0 ? latestEntries : entries)}
        exportCount={history?.total ?? null}
        exportLimit={history?.meta?.exportLimit}
      />

      <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : undefined}>
        <MaterielHistoryList entries={entries} canLinkToBon={canLinkToBon} />
      </div>

      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={history?.total ?? 0}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        itemLabel={{ singular: 'bon', plural: 'bons' }}
      />
    </div>
  );
}
