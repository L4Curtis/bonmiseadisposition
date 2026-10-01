import { ConfigSection } from '@/components/admin/ConfigSection';

export function ConfigTokensPage() {
  return (
    <>
      {/* Lot F1 : titre de page caché, cf. ConfigLdapPage. */}
      <h1 className="sr-only">Configuration — Tokens</h1>
      <ConfigSection
        title="Tokens de signature"
        category="tokens"
        fields={[
          {
            key: 'expiry_days',
            label: 'Validité des liens de signature (jours)',
            type: 'number',
            help: 'Entre 1 et 30 jours.',
          },
        ]}
      />
    </>
  );
}
