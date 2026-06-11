import { ConfigSection } from '@/components/admin/ConfigSection';

export function ConfigGeneralPage() {
  return (
    <ConfigSection
      title="Paramètres généraux"
      category="general"
      fields={[
        { key: 'local_auth_enabled', label: 'Connexion locale activée', toggle: true, defaultValue: 'true' },
        { key: 'app_url', label: 'URL publique de l\'application', placeholder: 'https://bons.groupelivio.local (défaut : FRONTEND_URL)' },
      ]}
    />
  );
}
