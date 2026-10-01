import { AlertTriangle, Package, PackageCheck, PackageX, ScanLine, Tag } from 'lucide-react';
import { LATENESS_LABELS } from '@/domain/labels';
import { formatDays } from '@/lib/kpi-format';
import { KpiCard } from '../../components/KpiCard';
import { FIVE_CARD_GRID } from '../../components/card-grid';
import { asOfLabel, countWithUnit, periodLabel, UNITS } from '../../lib/kpi-scope';
import type { ParcKpiResponse } from '../../types/parc';
import { NO_LIST } from '../../lists/kpi-lists';

interface ParcStatCardsProps {
  data: ParcKpiResponse | null;
  loading: boolean;
  /** Filiale choisie, reportée sur l'inventaire ouvert par une carte. */
  filialeId: string | null;
}

/** Adresse de l'inventaire avec les mêmes filtres que la carte. */
export function inventoryHref(filialeId: string | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (filialeId) params.set('filialeId', filialeId);
  const query = params.toString();
  return query ? `/inventaire?${query}` : '/inventaire';
}

/** « Voir l'équipement … » ou « Voir les 3 équipements … » : accord au nombre. */
export function seeEquipmentsLabel(count: number, what: string): string {
  return count === 1 ? `Voir l'équipement ${what}` : `Voir les ${countWithUnit(count, UNITS.equipments)} ${what}`;
}

/** « 1 équipement saisi en texte libre », « 3 équipements saisis en texte libre ». */
export function offCatalogDetail(count: number): string {
  if (count === 0) return 'aucun équipement saisi en texte libre';
  return `${countWithUnit(count, UNITS.equipments)} ${count > 1 ? 'saisis' : 'saisi'} en texte libre`;
}

/** Cartes de l'onglet Parc : états du jour (« au 25/09 », non filtrés par la
 *  période, sans comparaison) puis flux sur la période (comparés à la période
 *  précédente). Chaque état du jour ouvre l'inventaire filtré sur exactement
 *  ce qu'il compte, pour l'IT comme pour la direction ; les deux flux, tirés
 *  du journal, n'ont pas de liste exacte et le disent. */
export function ParcStatCards({ data, loading, filialeId }: ParcStatCardsProps) {
  const asOf = data ? asOfLabel(data.asOf) : undefined;
  const period = data ? periodLabel(data.period) : undefined;
  const overdue = data?.returnOverdue;
  const total = data?.loaned.total ?? 0;
  const missingSerial = data && data.loaned.serialCoverage !== null
    ? Math.round((1 - data.loaned.serialCoverage) * total)
    : 0;
  const offCatalog = data && data.loaned.offCatalogShare !== null
    ? Math.round(data.loaned.offCatalogShare * total)
    : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">État du jour</h3>
      <div className={FIVE_CARD_GRID}>
        <KpiCard
          label="Équipements chez les collaborateurs" value={data?.loaned.total ?? null} unit={UNITS.equipments}
          icon={Package} loading={loading} scope={asOf} href={inventoryHref(filialeId)}
          detail={data ? `sur ${countWithUnit(data.loaned.bons, UNITS.bons)}` : undefined}
          definition="Équipements remis et pas encore rendus : remise à signer, bon en cours, restitution en cours ou contesté. C'est la liste de l'Inventaire."
        />
        <KpiCard
          label={LATENESS_LABELS.return} value={overdue?.equipments ?? null} unit={UNITS.equipments}
          icon={AlertTriangle} loading={loading} scope={asOf} tone={(overdue?.equipments ?? 0) > 0 ? 'danger' : 'default'}
          href={inventoryHref(filialeId, { overdue: '1' })}
          detail={overdue && overdue.bons > 0
            ? `sur ${countWithUnit(overdue.bons, UNITS.bons)}, retard moyen ${formatDays(overdue.avgDays)} par bon`
            : 'date de restitution prévue dépassée'}
          definition="Équipements encore chez les collaborateurs dont la date de restitution prévue est passée. Le retard moyen est calculé par bon."
        />
        <KpiCard
          label="Encore non restitués" value={data?.notReturned.openNow ?? null} unit={UNITS.equipments}
          icon={PackageX} loading={loading} scope={asOf}
          href={inventoryHref(filialeId, { situation: 'non_restitue' })}
          definition="Équipements déclarés non restitués (perdus, cassés, gardés) et pas retrouvés depuis, y compris sur des bons clôturés."
        />
        <KpiCard
          label="Avec numéro de série" value={data?.loaned.serialCoverage ?? null} format="percent"
          icon={ScanLine} loading={loading} scope={asOf}
          href={missingSerial > 0 ? inventoryHref(filialeId, { sansNumeroSerie: '1' }) : undefined}
          hrefLabel={seeEquipmentsLabel(missingSerial, 'sans numéro')}
          noList={data && missingSerial === 0 ? NO_LIST.allWithSerial : undefined}
          detail={missingSerial > 0 ? `${countWithUnit(missingSerial, UNITS.equipments)} sans numéro` : 'tous les équipements en ont un'}
          definition="Part des équipements chez les collaborateurs dont le numéro de série est renseigné. Sans lui, on ne peut pas retrouver l'équipement ni le rapprocher d'un autre outil."
        />
        <KpiCard
          label="Hors catalogue" value={data?.loaned.offCatalogShare ?? null} format="percent" icon={Tag}
          loading={loading} scope={asOf}
          href={offCatalog > 0 ? inventoryHref(filialeId, { horsCatalogue: '1' }) : undefined}
          hrefLabel={seeEquipmentsLabel(offCatalog, 'hors catalogue')}
          noList={data && offCatalog === 0 ? NO_LIST.noneOffCatalog : undefined}
          detail={offCatalogDetail(offCatalog)}
          definition="Part des équipements chez les collaborateurs qui ne viennent pas d'un article du Catalogue (saisis en texte libre)."
        />
      </div>

      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sur la période</h3>
      <div className={FIVE_CARD_GRID}>
        <KpiCard
          label="Équipements déclarés non restitués" value={data?.notReturned.declared.current ?? null}
          unit={UNITS.equipments} icon={PackageX} loading={loading} scope={period}
          delta={data ? { ...data.notReturned.declared, invert: true } : undefined}
          definition="Équipements déclarés non restitués pendant la période. Une déclaration de trois équipements en compte trois."
          noList={NO_LIST.equipmentFlow}
        />
        <KpiCard
          label="Équipements retrouvés" value={data?.notReturned.found.current ?? null} unit={UNITS.equipments}
          icon={PackageCheck} loading={loading} scope={period} delta={data ? data.notReturned.found : undefined}
          definition="Équipements déclarés non restitués puis retrouvés pendant la période."
          noList={NO_LIST.equipmentFlow}
        />
      </div>
    </div>
  );
}
