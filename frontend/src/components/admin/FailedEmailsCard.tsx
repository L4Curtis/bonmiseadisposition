import { Link } from 'react-router';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useApiResource } from '@/hooks/use-api-resource';
import { formatDateTime } from '@/lib/utils';
import { notifTypeLabel } from '@/lib/labels';

interface FailedEmailItem {
  id: string;
  bonId: string | null;
  reference: string;
  recipient: string;
  type: string;
  sentAt: string;
  error: string;
}

interface FailedEmailsResponse {
  count: number;
  windowDays: number;
  items: FailedEmailItem[];
}

const WINDOW_DAYS = 30;

/** Carte « Emails non délivrés » — ex-bloc de Reports.tsx (fusionné dans le
 *  monitoring admin), alimentée par GET /admin/notifications/failed. */
export function FailedEmailsCard() {
  const { data, loading, error, reload } = useApiResource<FailedEmailsResponse>(
    `/admin/notifications/failed?days=${WINDOW_DAYS}`,
    'Erreur lors du chargement des emails non délivrés',
  );

  const items = data?.items ?? [];

  return (
    <ChartCard
      title={`Emails non délivrés (${data?.windowDays ?? WINDOW_DAYS} j)`}
      subtitle="Un lien de signature non reçu laisse le bon en attente : vérifiez l'adresse ou renvoyez le lien."
      loading={loading}
      error={error}
      onRetry={reload}
      empty={!loading && !error && items.length === 0}
      emptyMessage="Aucun email en échec sur la période."
    >
      <div className="-m-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Bon</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="hidden px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">Destinataire</th>
              <th className="hidden px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">Quand</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((n) => (
              <tr key={n.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">
                  {n.bonId ? (
                    <Link to={`/bons/${n.bonId}`} className="text-primary hover:underline">{n.reference}</Link>
                  ) : (
                    n.reference
                  )}
                </td>
                <td className="px-4 py-2">{notifTypeLabel(n.type)}</td>
                <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">{n.recipient}</td>
                <td className="hidden px-4 py-2 text-muted-foreground md:table-cell">{formatDateTime(n.sentAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
