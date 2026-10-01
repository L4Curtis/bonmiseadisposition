import { api } from '@/lib/api';
import { ConfigSection } from '@/components/admin/ConfigSection';
import type { ConnectionTestResponse } from '@/contracts/admin';

export function ConfigLdapPage() {
  return (
    <>
      {/* Lot F1 : titre de page caché — le titre visible équivalent est déjà
          porté par la carte ci-dessous (CardTitle), qu'il ne faut pas doubler. */}
      <h1 className="sr-only">Configuration — Active Directory</h1>
      <ConfigSection
        title="LDAP / Active Directory"
        category="ldap"
        onTest={() => api.post<ConnectionTestResponse>('/admin/config/test/ldap')}
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
            help: 'La synchronisation passe au plus souvent toutes les 6 heures.',
          },
        ]}
      />
    </>
  );
}
