import { Link } from 'react-router';
import { formatDate } from '@/lib/dates';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { ParcReturnOverdueTop } from '../../types/parc';
import { countWithUnit, UNITS } from '../../lib/kpi-scope';
import { inventoryHref } from './ParcStatCards';

interface ReturnOverdueTableProps {
  rows: ParcReturnOverdueTop[];
  /** IT : lien vers le bon. Direction (sans accès aux bons) : lien vers
   *  l'inventaire des seuls équipements en retard de ce bon. */
  canLinkToBon: boolean;
  filialeId: string | null;
}

const TH = 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground';

/** Lien d'une ligne : le bon (IT), ou ses équipements en retard dans
 *  l'inventaire (recherche sur la référence du bon), autant que la ligne en compte. */
function rowLink(row: ParcReturnOverdueTop, canLinkToBon: boolean, filialeId: string | null) {
  return canLinkToBon
    ? { to: `/bons/${row.bonId}`, label: `Ouvrir le bon ${row.reference}` }
    : {
        to: inventoryHref(filialeId, { overdue: '1', search: row.reference }),
        label: `Voir les équipements en retard du bon ${row.reference}`,
      };
}

function ReferenceLink({ row, canLinkToBon, filialeId }: { row: ParcReturnOverdueTop } & Omit<ReturnOverdueTableProps, 'rows'>) {
  const link = rowLink(row, canLinkToBon, filialeId);
  return (
    <Link
      to={link.to}
      className="inline-flex min-h-[44px] items-center rounded font-mono text-xs font-medium text-foreground/80 hover:underline"
      aria-label={link.label}
    >
      <span className="rounded bg-muted px-2 py-0.5">{row.reference}</span>
    </Link>
  );
}

/** Téléphone : une carte par bon, le retard et le nombre d'équipements visibles sans glisser. */
function OverdueCards({ rows, canLinkToBon, filialeId }: ReturnOverdueTableProps) {
  return (
    <ul className="divide-y divide-border" aria-label="Retards de restitution">
      {rows.map((row) => (
        <li key={row.bonId} className="space-y-1 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ReferenceLink row={row} canLinkToBon={canLinkToBon} filialeId={filialeId} />
            <span className="text-sm font-medium text-destructive">{`${row.daysLate} j de retard`}</span>
          </div>
          <p className="text-sm text-foreground/80">
            {row.collaborateur}
            <span className="text-xs text-muted-foreground"> · {row.filiale}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {`retour prévu le ${formatDate(row.dateRestitution)} · ${countWithUnit(row.equipments, UNITS.equipments)} en retard`}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Les 10 bons dont le retour est le plus en retard ; chaque ligne mène à la
 *  liste exacte qui la justifie. Cartes sur téléphone, tableau au-delà. */
export function ReturnOverdueTable(props: ReturnOverdueTableProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <OverdueCards {...props} />;
  const { rows, canLinkToBon, filialeId } = props;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Retards de restitution">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={TH}>Référence</th>
            <th scope="col" className={TH}>Collaborateur</th>
            <th scope="col" className={TH}>Filiale</th>
            <th scope="col" className={TH}>Date prévue</th>
            <th scope="col" className={`${TH} text-right`}>Jours de retard</th>
            <th scope="col" className={`${TH} text-right`}>Équipements en retard</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.bonId}>
              <td className="px-3 py-2.5"><ReferenceLink row={row} canLinkToBon={canLinkToBon} filialeId={filialeId} /></td>
              <td className="px-3 py-2.5 text-foreground/80">{row.collaborateur}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.filiale}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{formatDate(row.dateRestitution)}</td>
              <td className="px-3 py-2.5 text-right font-medium text-destructive">{row.daysLate}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{row.equipments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
