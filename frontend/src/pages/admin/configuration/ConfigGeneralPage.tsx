import { ConfigSection } from '@/components/admin/ConfigSection';
import { ConfigHealthCard } from './ConfigHealthCard';

export function ConfigGeneralPage() {
  return (
    <div className="space-y-5">
      {/* Lot F1 : titre de page — caché visuellement, le repère visible
          équivalent (CardTitle de ConfigHealthCard) resterait ambigu seul. */}
      <h1 className="sr-only">Configuration — Général</h1>
      <ConfigHealthCard />
      <ConfigSection
        title="Paramètres généraux"
        category="general"
        fields={[
          { key: 'local_auth_enabled', label: 'Connexion locale activée', toggle: true, defaultValue: 'true' },
          { key: 'app_url', label: 'URL publique de l\'application', placeholder: 'https://bons.groupelivio.local (défaut : FRONTEND_URL)' },
        ]}
      />
    </div>
  );
}
