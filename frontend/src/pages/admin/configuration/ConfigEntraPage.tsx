import { api } from '@/lib/api';
import { ConfigSection, type TestResult } from '@/components/admin/ConfigSection';

export function ConfigEntraPage() {
  return (
    <ConfigSection
      title="Microsoft Entra ID (SSO)"
      category="entra"
      onTest={() => api.post<TestResult>('/admin/config/test/entra')}
      testLabel="Tester la connexion Entra"
      fields={[
        { key: 'tenant_id', label: 'Tenant ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
        { key: 'client_id', label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-...' },
        { key: 'client_secret', label: 'Client Secret', type: 'password', encrypted: true },
        { key: 'redirect_uri', label: 'Redirect URI', placeholder: 'https://bons.entreprise.local/api/auth/callback' },
        { key: 'admin_group_id', label: 'Groupe Admin (Object ID)', placeholder: 'xxxxxxxx-...' },
        { key: 'technician_group_id', label: 'Groupe Technicien (Object ID)', placeholder: 'xxxxxxxx-...' },
      ]}
    />
  );
}
