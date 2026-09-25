import { Link } from 'react-router';
import { formatDate } from '@/lib/dates';
import type { ParcReturnOverdueTop } from '../../types/parc';

interface ReturnOverdueTableProps {
  rows: ParcReturnOverdueTop[];
  /** IT (admin/technician) seulement : Direction n'a pas accès aux bons individuels. */
  canLinkToBon: boolean;
}

/** Table des 10 bons en plus fort retard de restitution. */
export function ReturnOverdueTable({ rows, canLinkToBon }: ReturnOverdueTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Retards de restitution">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Référence</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Collaborateur</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filiale</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date prévue</th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jours de retard</th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Équipements</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.bonId}>
              <td className="px-3 py-2.5">
                {canLinkToBon ? (
                  <Link
                    to={`/bons/${row.bonId}`}
                    className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground/80 hover:underline"
                  >
                    {row.reference}
                  </Link>
                ) : (
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground/80">
                    {row.reference}
                  </span>
                )}
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
