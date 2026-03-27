import { ConfigSection } from '@/components/admin/ConfigSection';

export function ConfigGeneralPage() {
  return (
    <ConfigSection
      title="Paramètres généraux"
      category="general"
      fields={[
        { key: 'local_auth_enabled', label: 'Connexion locale activée', toggle: true, defaultValue: 'true' },
      ]}
    />
  );
}
