import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { usePeriodParams } from './use-period-params';
import { PeriodSelector } from './PeriodSelector';
import { FilialeFilter } from './FilialeFilter';
import { TodayTab } from './tabs/TodayTab';
import { ParcTab } from './tabs/ParcTab';
import { DelaisTab } from './tabs/DelaisTab';
import { IncidentsTab } from './tabs/IncidentsTab';

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

  const isIt = user?.role === 'admin' || user?.role === 'technician';
  const visibleTabs = useMemo(() => TABS.filter((t) => !t.itOnly || isIt), [isIt]);
  const defaultTabId = isIt ? 'today' : 'parc';

  const activeTabId = tab && visibleTabs.some((t) => t.id === tab) ? tab : defaultTabId;

  // `?tab` absent, invalide ou interdit pour le rôle courant → remplacé
  // silencieusement par le défaut (sans ajouter d'entrée d'historique).
  useEffect(() => {
    if (tab !== activeTabId) setTab(activeTabId);
  }, [tab, activeTabId, setTab]);

  const showPeriodControls = activeTabId !== 'today';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">Tableau de bord</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vue d&apos;ensemble de l&apos;activité du parc</p>
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
          <TabsList>
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          {showPeriodControls && (
            <div className="flex flex-wrap items-center gap-2">
              <PeriodSelector preset={preset} from={from} to={to} onPresetChange={setPreset} onRangeChange={setRange} />
              <FilialeFilter value={filialeId} onChange={setFilialeId} />
            </div>
          )}
        </div>

        {/* Seul l'onglet actif est monté : pas d'appel API en arrière-plan
            pour les onglets non consultés. */}
        <TabsContent value={activeTabId}>
          {activeTabId === 'today' && <TodayTab />}
          {activeTabId === 'parc' && <ParcTab />}
          {activeTabId === 'delais' && <DelaisTab />}
          {activeTabId === 'incidents' && <IncidentsTab />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
