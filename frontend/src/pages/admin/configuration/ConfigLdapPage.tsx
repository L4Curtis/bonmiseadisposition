import { api } from '@/lib/api';
import { ConfigSection } from '@/components/admin/ConfigSection';
import type { ConnectionTestResponse } from '@/contracts/admin';

/** Champs que le test de connexion utilise : il les prend tels que saisis,
 *  enregistrés ou non, et n'enregistre rien. Le mot de passe masqué n'est
 *  jamais envoyé : le serveur reprend alors celui qui est enregistré. */
const TESTED_FIELDS = ['url', 'use_ssl', 'bind_dn', 'bind_password', 'user_filter'] as const;

function testLdap(typed: Readonly<Record<string, string>>): Promise<ConnectionTestResponse> {
  const body = Object.fromEntries(TESTED_FIELDS.filter((key) => key in typed).map((key) => [key, typed[key]]));
  return api.post<ConnectionTestResponse>('/admin/config/test/ldap', body);
}

export function ConfigLdapPage() {
  return (
    <>
      {/* Lot F1 : titre de page caché — le titre visible équivalent est déjà
          porté par la carte ci-dessous (CardTitle), qu'il ne faut pas doubler. */}
      <h1 className="sr-only">Configuration — Active Directory</h1>
      <ConfigSection
        title="LDAP / Active Directory"
        category="ldap"
        onTest={testLdap}
        testLabel="Tester la connexion LDAP"
        fields={[
          { key: 'enabled', label: 'LDAP activé', toggle: true },
          { key: 'use_ssl', label: 'SSL/TLS', toggle: true },
          { key: 'url', label: 'URL LDAP', placeholder: 'ldaps://dc.entreprise.local:636' },
          { key: 'bind_dn', label: 'Bind DN', placeholder: 'CN=svc-ldap,OU=Services,DC=...' },
          { key: 'bind_password', label: 'Mot de passe', type: 'password', encrypted: true },
          { key: 'search_base', label: 'Search Base', placeholder: 'DC=entreprise,DC=local' },
          { key: 'user_filter', label: 'Filtre utilisateurs' },
          {
            key: 'sync_interval_hours',
            label: 'Fréquence de synchronisation (heures)',
            type: 'number',
            help: 'Entre 1 et 168 heures (une semaine). La synchronisation passe au plus souvent toutes les 6 heures.',
          },
        ]}
      />
    </>
  );
}
