import {
  AlertTriangle, Archive, CalendarCheck, CalendarClock, CheckCircle2, FileText, Send, Timer, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { TimeSeriesChart, type TimeSeriesDatum } from '@/components/dashboard/charts/TimeSeriesChart';
import { DonutChart, type DonutChartDatum } from '@/components/dashboard/charts/DonutChart';
import { EmptyPeriodNotice } from '@/components/dashboard/EmptyPeriodNotice';
import { useApiResource } from '@/hooks/use-api-resource';
import { useAuth } from '@/contexts/AuthContext';
import { LATENESS_LABELS } from '@/domain/labels';
import { isItRole } from '@/lib/roles';
import { KpiCard, KpiCardSkeleton, type KpiCardProps } from '../components/KpiCard';
import { FIVE_CARD_GRID } from '../components/card-grid';
import { asOfLabel, countWithUnit, periodLabel, UNITS } from '../lib/kpi-scope';
import { usePeriodParams } from '../use-period-params';
import type { DelaisKpiResponse } from '../types/delais';
import { SignatureDelayBars } from './delais/SignatureDelayBars';
import { SignatureModeTiles } from './delais/SignatureModeTiles';
import { WaitingStepsTable } from './delais/WaitingStepsTable';
import { TODAY_LINKS } from './today/today-links';
import { NO_LIST, type KpiListKey } from '../lists/kpi-lists';
import { useKpiListHref } from '../lists/use-kpi-list-href';
import type { ListHref } from './incidents/incident-stat-cards';

type CardDef = KpiCardProps & { key: string };

/** « 86 % des remises (6 sur 7) » : une part avec son effectif. */
function shareDetail(ratio: number | null, count: number): string {
  if (ratio === null || count === 0) return 'aucune remise signée sur la période';
  return `${Math.round(ratio * count)} remises sur ${count} signées`;
}

/** Liste exacte d'une carte de bons (IT), ou la raison de son absence (direction). */
function listOf(listHref: ListHref, key: KpiListKey): Pick<KpiCardProps, 'href' | 'noList'> {
  return listHref ? { href: listHref(key) } : { noList: NO_LIST.direction };
}

function volumeCards(data: DelaisKpiResponse, listHref: ListHref): CardDef[] {
  const scope = periodLabel(data.period);
  const { volumes } = data;
  return [
    { key: 'created', label: 'Bons créés', value: volumes.created.current, unit: UNITS.bons, icon: FileText, scope, delta: volumes.created, ...listOf(listHref, 'bons_crees') },
    {
      key: 'sent', label: 'Bons envoyés', value: volumes.sent.current, unit: UNITS.bons, icon: Send, scope, delta: volumes.sent,
      definition: 'Bons envoyés au collaborateur pendant la période ; un bon envoyé deux fois compte une fois.',
      ...listOf(listHref, 'bons_envoyes'),
    },
    { key: 'archived', label: 'Bons clôturés', value: volumes.archived.current, unit: UNITS.bons, icon: Archive, scope, delta: volumes.archived, ...listOf(listHref, 'bons_clotures') },
    { key: 'cancelled', label: 'Bons annulés', value: volumes.cancelled.current, unit: UNITS.bons, icon: XCircle, scope, delta: { ...volumes.cancelled, invert: true }, ...listOf(listHref, 'bons_annules') },
  ];
}

/** « Signature en retard » de la filiale choisie : même filtre sur la liste des bons. */
function overdueSignaturesHref(filialeId: string | null): string {
  return filialeId
    ? `${TODAY_LINKS.overdueSignatures}&filialeId=${encodeURIComponent(filialeId)}`
    : TODAY_LINKS.overdueSignatures;
}

function delayCards(data: DelaisKpiResponse, isIt: boolean, filialeId: string | null): CardDef[] {
  const scope = periodLabel(data.period);
  const remise = data.sendToSignature.mise_disposition;
  const overdue = data.waiting.overdueTotal;
  return [
    {
      key: 'creationToSend', label: 'Délai entre création et envoi', value: data.creationToSend.medianHours, format: 'hours',
      icon: Timer, scope, detail: `médiane, sur ${countWithUnit(data.creationToSend.count, UNITS.bons)} envoyés`,
      delta: data.creationToSend.medianHours != null
        ? { current: data.creationToSend.medianHours, previous: data.creationToSend.previous.medianHours, invert: true }
        : undefined,
      definition: "Temps entre la création d'un bon et son premier envoi au collaborateur. La médiane : la moitié des bons sont envoyés plus vite.",
      noList: NO_LIST.statistic,
    },
    {
      key: 'signed48h', label: 'Remises signées sous 48 h', value: remise.within48h, format: 'percent',
      icon: CheckCircle2, scope, detail: shareDetail(remise.within48h, remise.count),
      definition: 'Part des remises signées dans les 48 heures qui suivent la demande de signature, parmi les remises signées sur la période.',
      noList: NO_LIST.statistic,
    },
    {
      key: 'signed7d', label: 'Remises signées sous 7 jours', value: remise.within7d, format: 'percent',
      icon: CalendarCheck, scope, detail: shareDetail(remise.within7d, remise.count), noList: NO_LIST.statistic,
    },
    {
      key: 'loanDuration', label: 'Durée moyenne de prêt', value: data.loanDuration.avgDays.current, format: 'days',
      icon: CalendarClock, scope, detail: `sur ${countWithUnit(data.loanDuration.count, UNITS.bons)} clôturés`,
      delta: data.loanDuration.avgDays.current != null
        ? { current: data.loanDuration.avgDays.current, previous: data.loanDuration.avgDays.previous }
        : undefined,
      definition: 'Pour les bons clôturés sur la période : temps entre la signature de la remise et la clôture.',
      noList: NO_LIST.statistic,
    },
    {
      key: 'overdue', label: LATENESS_LABELS.signature, value: overdue, unit: UNITS.bons, icon: AlertTriangle,
      tone: overdue > 0 ? 'danger' : 'default', scope: asOfLabel(data.asOf),
      detail: `signature attendue depuis plus de ${data.waiting.thresholdDays} jours`,
      ...(isIt ? { href: overdueSignaturesHref(filialeId) } : { noList: NO_LIST.direction }),
    },
  ];
}

/** Onglet « Délais » (`GET /kpi/delais`) : volumes et délais sur la période,
 *  signatures attendues au jour. Chaque carte dit sa portée. */
export function DelaisTab() {
  const { user } = useAuth();
  const { from, to, filialeId, preset, setPreset } = usePeriodParams();
  const isIt = isItRole(user?.role);
  const listHref = useKpiListHref();

  const query = new URLSearchParams({ from, to });
  if (filialeId) query.set('filialeId', filialeId);
  const { data, loading, error, reload } = useApiResource<DelaisKpiResponse>(
    `/kpi/delais?${query.toString()}`,
    'Impossible de charger les indicateurs de délais',
  );

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={reload}>Réessayer</Button>
      </div>
    );
  }

  const volumeSeries: TimeSeriesDatum[] = (data?.volumes.series ?? []).map((p) => ({
    bucket: p.bucket, created: p.created, sent: p.sent, archived: p.archived,
  }));
  const statusData: DonutChartDatum[] = (data?.statusBreakdown ?? [])
    .filter((s) => s.count > 0)
    .map((s) => ({ key: s.status, label: s.label, value: s.count }));
  const totalWaiting = (data?.waiting.steps ?? []).reduce((sum, s) => sum + s.count, 0);
  const noSignature = !!data && data.signatureMode.inPerson.current === 0 && data.signatureMode.remote.current === 0;
  const noVolume = !!data && [data.volumes.created, data.volumes.sent, data.volumes.archived, data.volumes.cancelled]
    .every((v) => v.current === 0);

  return (
    <div className="space-y-6">
      {noVolume && noSignature && (
        <EmptyPeriodNotice
          quoi="bon créé, envoyé, clôturé ou annulé"
          onElargir={() => setPreset('12m')}
          elargissementPossible={preset !== '12m'}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading || !data
          ? Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : volumeCards(data, isIt ? listHref : null).map(({ key, ...card }) => <KpiCard key={key} {...card} />)}
      </div>

      <div className={FIVE_CARD_GRID}>
        {loading || !data
          ? Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : delayCards(data, isIt, filialeId).map(({ key, ...card }) => <KpiCard key={key} {...card} />)}
      </div>

      <ChartCard
        title="Bons créés, envoyés et clôturés"
        subtitle={data ? periodLabel(data.period) : undefined}
        loading={loading}
        delayIndex={1}
        empty={noVolume}
        emptyMessage="Aucun bon créé, envoyé ou clôturé sur la période."
      >
        {data && (
          <TimeSeriesChart
            data={volumeSeries}
            series={[
              { key: 'created', label: 'Créés' },
              { key: 'sent', label: 'Envoyés' },
              { key: 'archived', label: 'Clôturés' },
            ]}
            granularity={data.period.granularity}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Délai entre la demande et la signature"
        subtitle={data ? `Documents signés ${periodLabel(data.period)}` : undefined}
        loading={loading}
        delayIndex={3}
        empty={!loading && noSignature}
        emptyMessage="Aucune signature sur la période."
      >
        {data && <SignatureDelayBars sendToSignature={data.sendToSignature} />}
      </ChartCard>

      <ChartCard
        title="Comment les documents ont été signés"
        loading={loading}
        delayIndex={4}
        empty={!loading && noSignature}
        emptyMessage="Aucune signature sur la période."
      >
        {data && <SignatureModeTiles signatureMode={data.signatureMode} scope={periodLabel(data.period)} listHref={isIt ? listHref : null} />}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Bons par statut"
          subtitle={data ? `Tous les bons, ${asOfLabel(data.asOf)}` : undefined}
          loading={loading}
          empty={!loading && statusData.length === 0}
          delayIndex={2}
        >
          {data && <DonutChart data={statusData} />}
        </ChartCard>

        <ChartCard
          title="Signatures attendues par document"
          subtitle={data ? asOfLabel(data.asOf) : undefined}
          delayIndex={5}
          loading={loading}
          empty={!loading && totalWaiting === 0}
          emptyMessage="Aucune signature attendue."
        >
          {data && <WaitingStepsTable steps={data.waiting.steps} thresholdDays={data.waiting.thresholdDays} />}
        </ChartCard>
      </div>
    </div>
  );
}
