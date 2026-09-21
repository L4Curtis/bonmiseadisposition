import type { ElementType } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Bell, CheckCircle2, FileText, RotateCcw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useActionableBons, type ActionableBonRow, type ActionableCategory } from './useActionableBons';

interface CategoryDef {
  key: string;
  label: string;
  icon: ElementType;
  /** Libellé de l'action proposée pour chaque ligne (« Envoyer », « Relancer »…). */
  actionLabel: string;
  /** Liste filtrée existante vers laquelle pointe le lien « Voir tout ». */
  seeAllHref: string;
  category: ActionableCategory;
}

function formatDaysAgo(days: number): string {
  if (days <= 0) return "aujourd'hui";
  return `il y a ${days} j`;
}

function CategoryRow({ row, actionLabel, onClick }: { row: ActionableBonRow; actionLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground/80">
        {row.reference}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{row.collaborateurName}</span>
      <span className="shrink-0 text-xs text-muted-foreground/70">{formatDaysAgo(row.daysAgo)}</span>
      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary">
        {actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </button>
  );
}

function CategorySection({ def, onNavigate }: { def: CategoryDef; onNavigate: (href: string) => void }) {
  const Icon = def.icon;
  return (
    <div className="py-4">
      <div className="mb-1 flex items-center justify-between gap-3 px-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/80">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {def.label}
        </div>
        <button
          type="button"
          onClick={() => onNavigate(def.seeAllHref)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {`Voir tout (${def.category.total})`}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="divide-y divide-border/60">
        {def.category.rows.map((row) => (
          <CategoryRow key={row.id} row={row} actionLabel={def.actionLabel} onClick={() => onNavigate(`/bons/${row.id}`)} />
        ))}
      </div>
    </div>
  );
}

function ActionableTasksSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-2.5 px-5 py-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Bloc « À traiter aujourd'hui » (lot E1) : remplace les compteurs muets par
 * du travail concret — brouillons jamais envoyés, signatures en attente
 * au-delà du seuil configuré, restitutions en retard — chacun avec l'action
 * attendue et un lien « voir tout » vers la liste filtrée correspondante.
 * Une catégorie vide n'est pas affichée ; si tout est vide, un mot rassurant
 * remplace le bloc plutôt que de laisser trois sections vides côte à côte.
 */
export function ActionableTasksCard() {
  const navigate = useNavigate();
  const { drafts, overdueSignatures, overdueReturns, loading } = useActionableBons();

  const categories: CategoryDef[] = [
    {
      key: 'drafts',
      label: 'Brouillons jamais envoyés',
      icon: FileText,
      actionLabel: 'Envoyer',
      seeAllHref: '/bons?status=draft',
      category: drafts,
    },
    {
      key: 'overdue-signatures',
      label: 'Signatures en attente',
      icon: Bell,
      actionLabel: 'Relancer',
      seeAllHref: '/bons?overdue=1',
      category: overdueSignatures,
    },
    {
      key: 'overdue-returns',
      label: 'Restitutions en retard',
      icon: RotateCcw,
      actionLabel: 'Initier la restitution',
      seeAllHref: '/bons?status=active',
      category: overdueReturns,
    },
  ];

  const visibleCategories = categories.filter((c) => c.category.rows.length > 0);
  const allEmpty = !loading && visibleCategories.length === 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card card-elevated">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">À traiter aujourd&apos;hui</h3>
      </div>

      {loading ? (
        <ActionableTasksSkeleton />
      ) : allEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground/80">Rien à traiter aujourd&apos;hui</p>
          <p className="text-xs text-muted-foreground/70">Tous les bons suivis sont à jour.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visibleCategories.map((def) => (
            <CategorySection key={def.key} def={def} onNavigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}
