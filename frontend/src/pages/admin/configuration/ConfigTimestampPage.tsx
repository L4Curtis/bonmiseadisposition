import { ConfigSection } from '@/components/admin/ConfigSection';

export function ConfigTimestampPage() {
  return (
    <ConfigSection
      title="Horodatage RFC 3161 (optionnel)"
      category="timestamp"
      fields={[
        { key: 'enabled', label: 'Horodatage des signatures activé', toggle: true },
        { key: 'tsa_url', label: 'URL de l’autorité d’horodatage (TSA)', placeholder: 'https://freetsa.org/tsr' },
      ]}
      footer={
        <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
          Quand activé, chaque signature reçoit un jeton d’horodatage signé par une autorité de temps de
          confiance (preuve de date opposable). Best-effort : si la TSA est injoignable, la signature reste
          valide (scellée par HMAC). Laisser désactivé si vous n’avez pas de TSA.
        </p>
      }
    />
  );
}
