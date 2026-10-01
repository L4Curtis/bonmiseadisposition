import { ExportButton } from '@/components/export';
import { api } from '@/lib/api';
import { todayInParis } from '@/lib/dates';
import type { User } from '@/types';

/** Les comptes que contient le fichier : tous ceux créés à la main, actifs
 *  et désactivés (GET /users, filtré par origine, n'en lit que le total). */
const COUNT_PATH = '/users?origin=manual&status=all&page=1&limit=25';

async function countManualUsers(signal: AbortSignal): Promise<number> {
  const page = await api.getList<User>(COUNT_PATH, { signal });
  return page.total;
}

/**
 * Export CSV des collaborateurs créés à la main (GET /users/manual/export) :
 * le fichier de sauvegarde et de réimport de ces comptes. Il ne suit pas les
 * filtres de la liste, qui portent sur tous les comptes : la confirmation
 * annonce le nombre de comptes exportés et le dit.
 */
export function ManualUsersExportButton() {
  return (
    <ExportButton
      className="w-full sm:w-auto"
      path="/users/manual/export"
      fallbackFilename={`collaborateurs-manuels-${todayInParis()}.csv`}
      filters={[]}
      loadCount={countManualUsers}
      itemLabel={{ singular: 'compte créé à la main', plural: 'comptes créés à la main' }}
      title="Exporter les collaborateurs créés à la main"
      note="Tous les comptes créés à la main, actifs et désactivés, quels que soient les filtres de la liste : le fichier se réimporte tel quel."
      errorMessage="Erreur lors de l'export des collaborateurs"
    />
  );
}
