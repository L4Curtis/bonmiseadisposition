import { lazy, Suspense, useEffect, useMemo } from 'react';
import { FADE_IN } from '@/components/dashboard/stagger';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { DashboardTabSkeleton } from '@/components/dashboard/DashboardTabSkeleton';
import { usePeriodParams } from './use-period-params';
import { PeriodSelector } from './PeriodSelector';
import { FilialeFilter } from './FilialeFilter';
import { TodayTab } from './tabs/TodayTab';
import { KpiListDialog } from './lists/KpiListDialog';
import { isKpiListKey, LIST_PARAM } from './lists/kpi-lists';

// Parc, Délais et Incidents embarquent Recharts (~141 kB gzip à eux trois) :
// chargés paresseusement, pour que l'onglet « Aujourd'hui » (sans graphique,
// et actif par défaut pour l'IT) ne paie jamais ce poids. Voir aussi
// App.direction.test.tsx, qui précharge ces modules en `beforeAll` pour éviter
// un lazy() suspendu en jsdom.
const ParcTab = lazy(() => import('./tabs/ParcTab').then((m) => ({ default: m.ParcTab })));
const DelaisTab = lazy(() => import('./tabs/DelaisTab').then((m) => ({ default: m.DelaisTab })));
const IncidentsTab = lazy(() => import('./tabs/IncidentsTab').then((m) => ({ default: m.IncidentsTab })));

interface DashboardTabDef {
  id: string;
  label: string;
  /** Réservé à l'IT (admin/technician) — masqué pour les autres rôles (Direction, à venir). */
  itOnly?: boolean;
}

const TABS: DashboardTabDef[] = [
  { id: 'today', label: "Aujourd'hui", itOnly: true },
  { id: 'parc', label: 'Parc' },
  { id: 'delais', label: 'Délais' },
  { id: 'incidents', label: 'Incidents' },
];

const todayFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/** Page à onglets qui unifie l'ancien Tableau de bord IT et le Reporting admin.
 *  Le rôle Direction (lecture seule, sans « Aujourd'hui ») arrive au lot 3b :
 *  le code est déjà prêt via `isIt`, qui reste le seul critère de visibilité
 *  de l'onglet « Aujourd'hui » et du bouton « Nouveau bon ». */
export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tab, from, to, filialeId, preset, setTab, setRange, setPreset, setFilialeId } = usePeriodParams();
  const [searchParams] = useSearchParams();
  const openList = searchParams.get(LIST_PARAM);

  const isIt = isItRole(user?.role);
  const visibleTabs = useMemo(() => TABS.filter((t) => !t.itOnly || isIt), [isIt]);
  const defaultTabId = isIt ? 'today' : 'parc';

  const activeTabId = tab && visibleTabs.some((t) => t.id === tab) ? tab : defaultTabId;

  // `?tab` absent, invalide ou interdit pour le rôle courant → remplacé
  // silencieusement par le défaut (sans ajouter d'entrée d'historique).
  useEffect(() => {
    if (tab !== activeTabId) setTab(activeTabId);
  }, [tab, activeTabId, setTab]);

  const showPeriodControls = activeTabId !== 'today';
  // Liste d'un chiffre « sur la période » : IT seulement (chaque ligne mène à un bon).
  const listKey = isIt && showPeriodControls && isKpiListKey(openList) ? openList : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* Lot F1 : premier (et unique) titre de la page — repère de
              structure pour un lecteur d'écran, comme sur Bons/Inventaire/Filiales. */}
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground sm:text-[26px]">Tableau de bord</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ce qui est à traiter, le parc prêté et les délais</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground/70 sm:flex">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{todayFormatter.format(new Date())}</span>
          </div>
          {isIt && (
            <Button onClick={() => navigate('/bons/new')} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nouveau bon
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTabId} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="max-w-full overflow-x-auto overflow-y-hidden">
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="min-h-[36px] whitespace-nowrap">{t.label}</TabsTrigger>
            ))}
          </TabsList>

          {showPeriodControls && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <PeriodSelector preset={preset} from={from} to={to} onPresetChange={setPreset} onRangeChange={setRange} />
              <FilialeFilter value={filialeId} onChange={setFilialeId} className="h-9 w-full sm:w-[200px]" />
            </div>
          )}
        </div>
        {showPeriodControls && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            La période ne change que les indicateurs « sur la période ». Ceux de l&apos;« état du jour » sont
            toujours calculés à la date d&apos;aujourd&apos;hui ; la filiale s&apos;applique à tous.
          </p>
        )}

        {/* Seul l'onglet actif est monté : pas d'appel API en arrière-plan
            pour les onglets non consultés. */}
        <TabsContent value={activeTabId}>
          {/* La clé force un remontage à chaque onglet : le contenu arrive en
              fondu au lieu d'apparaître brutalement. */}
          <div key={activeTabId} className={FADE_IN}>
            {activeTabId === 'today' && <TodayTab />}
            {activeTabId !== 'today' && (
              <Suspense fallback={<DashboardTabSkeleton />}>
                {activeTabId === 'parc' && <ParcTab />}
                {activeTabId === 'delais' && <DelaisTab />}
                {activeTabId === 'incidents' && <IncidentsTab />}
              </Suspense>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {listKey && <KpiListDialog key={`${listKey}:${from}:${to}:${filialeId ?? ''}`} indicateur={listKey} from={from} to={to} filialeId={filialeId} />}
    </div>
  );
}
