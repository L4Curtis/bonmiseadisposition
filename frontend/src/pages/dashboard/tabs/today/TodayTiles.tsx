import {
  AlertTriangle, CheckCircle, Clock, FileText, LinkIcon, MessageSquareWarning, PackageX, RotateCcw, UserX,
} from 'lucide-react';
import type { KpiTodayResponse } from '@/contracts/kpi';
import { LATENESS_LABELS } from '@/domain/labels';
import { KpiCard, KpiCardSkeleton, type KpiCardProps } from '../../components/KpiCard';
import { FIVE_CARD_GRID } from '../../components/card-grid';
import { asOfLabel, countWithUnit, UNITS } from '../../lib/kpi-scope';
import { TODAY_LINKS } from './today-links';

type TileDef = KpiCardProps & { key: string };

/** Tuiles « à traiter » : chacune ouvre la liste exacte qu'elle compte. */
function urgentTiles(data: KpiTodayResponse): TileDef[] {
  const scope = asOfLabel(data.asOf);
  const days = data.signatureOverdueDays;
  return [
    {
      key: 'overdueSignatures', label: LATENESS_LABELS.signature, value: data.overdueSignatures, unit: UNITS.bons,
      icon: AlertTriangle, tone: data.overdueSignatures > 0 ? 'danger' : 'default', scope,
      detail: `signature attendue depuis plus de ${days} jours`, href: TODAY_LINKS.overdueSignatures,
      definition: `Bons dont la signature du collaborateur est demandée depuis plus de ${days} jours (seuil réglé dans Paramètres, Rappels). L'ancienneté part de la demande du document, pas d'un simple renvoi du lien.`,
    },
    {
      key: 'overdueReturns', label: LATENESS_LABELS.return, value: data.overdueReturns.equipments, unit: UNITS.equipments,
      icon: RotateCcw, tone: data.overdueReturns.equipments > 0 ? 'danger' : 'default', scope,
      detail: `sur ${countWithUnit(data.overdueReturns.bons, UNITS.bons)}, date de retour dépassée`,
      href: TODAY_LINKS.overdueReturns,
      definition: "Équipements encore chez les collaborateurs dont la date de restitution prévue est passée. Le chiffre compte des équipements : un bon de trois équipements en retard en compte trois.",
    },
    {
      key: 'contestations', label: 'Contestations à traiter', value: data.contestationsToProcess, unit: UNITS.contestations,
      icon: MessageSquareWarning, tone: data.contestationsToProcess > 0 ? 'warning' : 'default', scope,
      detail: 'ouvertes ou en cours d’examen', href: TODAY_LINKS.contestations,
      definition: 'Contestations reçues et pas encore tranchées (ni Fondée, ni Non retenue).',
    },
    {
      key: 'expiredLinks', label: 'Liens expirés', value: data.expiredLinks, unit: UNITS.bons,
      icon: LinkIcon, tone: data.expiredLinks > 0 ? 'warning' : 'default', scope,
      detail: 'lien de signature à renvoyer', href: TODAY_LINKS.expiredLinks,
      definition: "Bons dont le dernier lien de signature envoyé a expiré sans qu'un nouveau lien soit parti.",
    },
    {
      key: 'departures', label: 'Départs avec matériel', value: data.departures.collaborateurs, unit: UNITS.collaborateurs,
      icon: UserX, tone: data.departures.collaborateurs > 0 ? 'warning' : 'default', scope,
      detail: `${data.departures.collaborateurs > 1 ? 'détiennent' : 'détient'} ${countWithUnit(data.departures.equipments, UNITS.equipments)}`, href: TODAY_LINKS.departures,
      definition: "Collaborateurs dont le compte est désactivé (départ) et qui détiennent encore des équipements.",
    },
  ];
}

/** Tuiles de suivi : où en sont les bons aujourd'hui. */
function stateTiles(data: KpiTodayResponse): TileDef[] {
  const scope = asOfLabel(data.asOf);
  return [
    {
      key: 'awaitingSignatures', label: 'Signatures attendues', value: data.awaitingSignatures, unit: UNITS.bons,
      icon: Clock, scope, detail: 'remise, restitution ou PV à signer', href: TODAY_LINKS.awaitingSignatures,
      definition: 'Bons dont une signature du collaborateur est attendue : remise à signer, restitution à signer, ou restitution en cours avec un PV ou une restitution partielle à signer.',
    },
    {
      key: 'openBons', label: 'Bons ouverts', value: data.openBons, unit: UNITS.bons, icon: FileText, scope,
      detail: 'ni clôturés ni annulés', href: TODAY_LINKS.openBons,
    },
    {
      key: 'activeBons', label: 'Bons en cours', value: data.activeBons, unit: UNITS.bons, icon: CheckCircle, scope,
      detail: 'remise faite, rien en attente', href: TODAY_LINKS.activeBons,
    },
    {
      key: 'restitution', label: 'Restitution en cours', value: data.restitutionInProgress, unit: UNITS.bons,
      icon: PackageX, scope, detail: 'une partie du matériel est revenue', href: TODAY_LINKS.restitutionInProgress,
    },
  ];
}

interface TodayTilesProps {
  data: KpiTodayResponse | null;
  loading: boolean;
}

/** Deux rangées de tuiles de l'accueil IT : « à traiter » puis « suivi ».
 *  Sur téléphone, deux colonnes compactes. */
export function TodayTiles({ data, loading }: TodayTilesProps) {
  if (loading || !data) {
    return (
      <div className={FIVE_CARD_GRID}>
        {Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }
  return (
    <div className="space-y-3 sm:space-y-4">
      <section aria-label="À traiter" className={FIVE_CARD_GRID}>
        {urgentTiles(data).map(({ key, ...card }) => <KpiCard key={key} {...card} />)}
      </section>
      <section aria-label="Suivi des bons" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stateTiles(data).map(({ key, ...card }) => <KpiCard key={key} {...card} />)}
      </section>
    </div>
  );
}
