import { Link } from 'react-router';
import { formatDate } from '@/lib/dates';
import type { ParcReturnOverdueTop } from '../../types/parc';
import { inventoryHref } from './ParcStatCards';

interface ReturnOverdueTableProps {
  rows: ParcReturnOverdueTop[];
  /** IT : lien vers le bon. Direction (sans accès aux bons) : lien vers
   *  l'inventaire filtré sur ce collaborateur et ses retours en retard. */
  canLinkToBon: boolean;
  filialeId: string | null;
}

/** Les 10 bons dont le retour est le plus en retard ; chaque ligne mène à la
 *  liste qui la justifie. */
export function ReturnOverdueTable({ rows, canLinkToBon, filialeId }: ReturnOverdueTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Retards de restitution">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Référence</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Collaborateur</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Filiale</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Date prévue</th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Jours de retard</th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Équipements en retard</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.bonId}>
              <td className="px-3 py-2.5">
                <Link
                  to={canLinkToBon ? `/bons/${row.bonId}` : inventoryHref(filialeId, { overdue: '1', search: row.collaborateur })}
                  className="inline-flex min-h-[44px] items-center rounded font-mono text-xs font-medium text-foreground/80 hover:underline"
                  aria-label={canLinkToBon ? `Ouvrir le bon ${row.reference}` : `Voir les équipements en retard de ${row.collaborateur}`}
                >
                  <span className="rounded bg-muted px-2 py-0.5">{row.reference}</span>
                </Link>
              </td>
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
