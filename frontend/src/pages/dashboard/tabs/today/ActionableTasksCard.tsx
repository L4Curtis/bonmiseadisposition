import type { ElementType } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileText, LinkIcon, MessageSquareWarning, PenLine, RotateCcw, UserX,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { KpiTodayResponse, KpiTodayRow, KpiTodaySection } from '@/contracts/kpi';
import { BON_SUB_STATUS_LABELS, LATENESS_LABELS } from '@/domain/labels';
import { formatDate } from '@/lib/dates';
import { countWithUnit, sinceLabel, UNITS, type Unit } from '../../lib/kpi-scope';
import { TODAY_LINKS } from './today-links';

type SectionKey = keyof KpiTodayResponse['toDo'];

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: ElementType;
  unit: Unit;
  /** Geste attendu sur chaque ligne (« Relancer »). */
  actionLabel: string;
  /** Ce que mesure la date de la ligne. */
  sinceWord: string;
  seeAllHref: string;
}

/** Ordre de lecture : ce qui bloque le collaborateur ou la preuve d'abord. */
const SECTIONS: readonly SectionDef[] = [
  { key: 'contestations', label: 'Contestations à traiter', icon: MessageSquareWarning, unit: UNITS.contestations,
    actionLabel: 'Traiter', sinceWord: 'reçue le', seeAllHref: TODAY_LINKS.contestations },
  { key: 'overdueSignatures', label: LATENESS_LABELS.signature, icon: AlertTriangle, unit: UNITS.bons,
    actionLabel: 'Relancer', sinceWord: 'demandée le', seeAllHref: TODAY_LINKS.overdueSignatures },
  { key: 'expiredLinks', label: 'Liens expirés', icon: LinkIcon, unit: UNITS.bons,
    actionLabel: 'Renvoyer un lien', sinceWord: 'expiré le', seeAllHref: TODAY_LINKS.expiredLinks },
  { key: 'partialRestitutionsToSign', label: BON_SUB_STATUS_LABELS.partial_restitution_to_sign, icon: PenLine,
    unit: UNITS.bons, actionLabel: 'Faire signer', sinceWord: 'demandée le',
    seeAllHref: TODAY_LINKS.partialRestitutionsToSign },
  { key: 'overdueReturns', label: LATENESS_LABELS.return, icon: RotateCcw, unit: UNITS.equipments,
    actionLabel: 'Organiser le retour', sinceWord: 'prévu le', seeAllHref: TODAY_LINKS.overdueReturns },
  { key: 'departures', label: 'Départs avec matériel', icon: UserX, unit: UNITS.collaborateurs,
    actionLabel: 'Voir le bon', sinceWord: 'remis le', seeAllHref: TODAY_LINKS.departures },
  { key: 'drafts', label: 'Brouillons jamais envoyés', icon: FileText, unit: UNITS.bons,
    actionLabel: 'Envoyer', sinceWord: 'créé le', seeAllHref: TODAY_LINKS.drafts },
];

function TaskRow({ row, def }: { row: KpiTodayRow; def: SectionDef }) {
  return (
    <Link
      to={`/bons/${row.bonId}`}
      className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-muted/40 sm:flex-nowrap sm:px-5"
    >
      <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground/80">
        {row.reference}
      </span>
      {/* Nom du collaborateur toujours lisible : il passe à la ligne plutôt que d'être masqué. */}
      <span className="order-last w-full min-w-0 break-words text-sm text-foreground/80 sm:order-none sm:w-auto sm:flex-1">
        {row.collaborateur}
        {row.detail && <span className="text-muted-foreground"> · {row.detail}</span>}
      </span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground sm:ml-0" title={`${def.sinceWord} ${formatDate(row.since)}`}>
        {sinceLabel(row.since)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
        {def.actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </Link>
  );
}

function TaskSection({ def, section }: { def: SectionDef; section: KpiTodaySection }) {
  const Icon = def.icon;
  return (
    <section className="py-3" aria-label={def.label}>
      <div className="mb-1 flex items-center justify-between gap-3 px-4 sm:px-5">
        <h4 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {`${def.label} (${countWithUnit(section.total, def.unit)})`}
        </h4>
        <Link
          to={def.seeAllHref}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Voir tout
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-border/60">
        {section.rows.map((row) => <TaskRow key={`${def.key}-${row.bonId}-${row.since}`} row={row} def={def} />)}
      </div>
    </section>
  );
}

interface ActionableTasksCardProps {
  data: KpiTodayResponse | null;
  loading: boolean;
}

/**
 * « À traiter aujourd'hui » : pour chaque situation, les cas les plus anciens
 * avec leur ancienneté et un lien vers le bon, et « Voir tout » vers la liste
 * complète (même nombre que la tuile). Une section vide n'est pas affichée.
 */
export function ActionableTasksCard({ data, loading }: ActionableTasksCardProps) {
  const visible = data ? SECTIONS.filter((def) => data.toDo[def.key].total > 0) : [];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card card-elevated">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-foreground">À traiter aujourd&apos;hui</h3>
      </div>
      {loading || !data ? (
        <div className="space-y-2.5 px-5 py-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground/80">Rien à traiter aujourd&apos;hui</p>
          <p className="text-xs text-muted-foreground/70">Aucun retard, aucune contestation, aucun lien expiré.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visible.map((def) => <TaskSection key={def.key} def={def} section={data.toDo[def.key]} />)}
        </div>
      )}
    </div>
  );
}
