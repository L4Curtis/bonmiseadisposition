import { useNavigate } from 'react-router';
import {
  FileText, Send, Archive, XCircle,
  Timer, CheckCircle2, CalendarCheck, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard, StatCardSkeleton, type StatCardProps, type StatCardTone } from '@/components/dashboard/StatCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { TimeSeriesChart, type TimeSeriesDatum } from '@/components/dashboard/charts/TimeSeriesChart';
import { DonutChart, type DonutChartDatum } from '@/components/dashboard/charts/DonutChart';
import { staggerClass } from '@/components/dashboard/stagger';
import { EmptyPeriodNotice } from '@/components/dashboard/EmptyPeriodNotice';
import { useApiResource } from '@/hooks/use-api-resource';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { usePeriodParams } from '../use-period-params';
import type { DelaisKpiResponse } from '../types/delais';
import { SignatureDelayBars } from './delais/SignatureDelayBars';
import { SignatureModeTiles } from './delais/SignatureModeTiles';
import { WaitingStepsTable } from './delais/WaitingStepsTable';

const DEFAULT_THRESHOLD_DAYS = 7;

type CardDef = StatCardProps & { key: string };

/** Onglet « Délais » — workflow et délais de traitement (`GET /kpi/delais`).
 *  Un seul appel API pour tout l'onglet ; skeletons distribués par bloc
 *  pendant le chargement, erreur unique avec Réessayer en cas d'échec. */
export function DelaisTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { from, to, filialeId, preset, setPreset } = usePeriodParams();
  const isIt = isItRole(user?.role);

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

  const thresholdDays = data?.waiting.thresholdDays ?? DEFAULT_THRESHOLD_DAYS;
  const overdueTotal = data?.waiting.overdueTotal ?? 0;
  const overdueTone: StatCardTone = overdueTotal > 0 ? 'danger' : 'default';

  const volumeCards: CardDef[] = data ? [
    {
      key: 'created', label: 'Bons créés', value: data.volumes.created.current, icon: FileText,
      delta: { current: data.volumes.created.current, previous: data.volumes.created.previous },
    },
    {
      key: 'sent', label: 'Envoyés', value: data.volumes.sent.current, icon: Send,
      delta: { current: data.volumes.sent.current, previous: data.volumes.sent.previous },
    },
    {
      key: 'archived', label: 'Archivés', value: data.volumes.archived.current, icon: Archive,
      delta: { current: data.volumes.archived.current, previous: data.volumes.archived.previous },
    },
    {
      key: 'cancelled', label: 'Annulés', value: data.volumes.cancelled.current, icon: XCircle,
      delta: { current: data.volumes.cancelled.current, previous: data.volumes.cancelled.previous, invert: true },
    },
  ] : [];

  const delayCards: CardDef[] = data ? [
    {
      key: 'creationToSend', label: 'Délai création → envoi', value: data.creationToSend.medianHours,
      icon: Timer, format: 'hours',
      delta: data.creationToSend.medianHours != null
        ? { current: data.creationToSend.medianHours, previous: data.creationToSend.previous.medianHours, invert: true }
        : undefined,
    },
    {
      key: 'signed48h', label: 'Signé sous 48 h', value: data.sendToSignature.mise_disposition.within48h,
      icon: CheckCircle2, format: 'percent', hint: 'Mise à disposition',
    },
    {
      key: 'signed7d', label: 'Signé sous 7 j', value: data.sendToSignature.mise_disposition.within7d,
      icon: CalendarCheck, format: 'percent', hint: 'Mise à disposition',
    },
    {
      key: 'avgLoanDuration', label: 'Durée moyenne de prêt', value: data.loanDuration.avgDays.current,
      icon: CalendarClock, format: 'days',
      delta: data.loanDuration.avgDays.current != null
        ? { current: data.loanDuration.avgDays.current, previous: data.loanDuration.avgDays.previous, invert: true }
        : undefined,
    },
    {
      key: 'overdue', label: `En retard de signature (> ${thresholdDays} j)`, value: overdueTotal,
      icon: AlertTriangle, tone: overdueTone,
      onClick: isIt ? () => navigate('/bons?overdue=1') : undefined,
    },
  ] : [];

  const volumeSeries: TimeSeriesDatum[] = (data?.volumes.series ?? []).map((p) => ({
    bucket: p.bucket, created: p.created, sent: p.sent, archived: p.archived,
  }));

  const statusData: DonutChartDatum[] = (data?.statusBreakdown ?? [])
    .filter((s) => s.count > 0)
    .map((s) => ({ key: s.status, label: s.label, value: s.count }));

  const totalWaiting = (data?.waiting.steps ?? []).reduce((sum, s) => sum + s.count, 0);

  // Période sans aucun mouvement : les tuiles n'affichent alors que des zéros
  // et des tirets, et les graphiques se dessinent vides. On le dit clairement
  // plutôt que de laisser croire à une panne.
  const signatureModeVide =
    !!data &&
    data.signatureMode.inPerson.current === 0 &&
    data.signatureMode.remote.current === 0 &&
    data.signatureMode.proxy.current === 0;
  const volumesVides =
    !!data &&
    data.volumes.created.current === 0 &&
    data.volumes.sent.current === 0 &&
    data.volumes.archived.current === 0 &&
    data.volumes.cancelled.current === 0;
  // La répartition par statut est un instantané de tous les bons, pas une
  // activité de période : elle ne compte pas pour juger la période vide.
  const periodeVide = volumesVides && signatureModeVide;

  return (
    <div className="space-y-6">
      {periodeVide && (
        <EmptyPeriodNotice
          quoi="bon créé, envoyé, archivé ou annulé"
          onElargir={() => setPreset('12m')}
          elargissementPossible={preset !== '12m'}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : volumeCards.map(({ key, ...card }, index) => (
              <StatCard key={key} {...card} className={staggerClass(index)} />
            ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
          : delayCards.map(({ key, ...card }, index) => (
              <StatCard key={key} {...card} className={staggerClass(index)} />
            ))}
      </div>

      <ChartCard
        title="Volumes sur la période"
        loading={loading}
        delayIndex={1}
        empty={volumesVides}
        emptyMessage="Aucun bon créé, envoyé ou archivé sur la période."
      >
        {data && (
          <TimeSeriesChart
            data={volumeSeries}
            series={[
              { key: 'created', label: 'Créés' },
              { key: 'sent', label: 'Envoyés' },
              { key: 'archived', label: 'Archivés' },
            ]}
            granularity={data.period.granularity}
          />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Répartition par statut" loading={loading} empty={!loading && statusData.length === 0} delayIndex={2}>
          {data && <DonutChart data={statusData} />}
        </ChartCard>

        <ChartCard
          title="Délai envoi → signature par type"
          loading={loading}
          delayIndex={3}
          empty={!loading && signatureModeVide}
          emptyMessage="Aucune signature sur la période."
        >
          {data && <SignatureDelayBars sendToSignature={data.sendToSignature} />}
        </ChartCard>
      </div>

      <ChartCard
        title="Mode de signature"
        loading={loading}
        delayIndex={4}
        empty={!loading && signatureModeVide}
        emptyMessage="Aucune signature sur la période."
      >
        {data && <SignatureModeTiles signatureMode={data.signatureMode} />}
      </ChartCard>

      <ChartCard
        title="En attente par étape"
        delayIndex={5}
        loading={loading}
        empty={!loading && totalWaiting === 0}
        emptyMessage="Aucun bon en attente."
      >
        {data && <WaitingStepsTable steps={data.waiting.steps} />}
      </ChartCard>
    </div>
  );
}
