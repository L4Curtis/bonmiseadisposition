import { ConfigSection } from '@/components/admin/ConfigSection';

export function ConfigTokensPage() {
  return (
    <ConfigSection
      title="Tokens de signature"
      category="tokens"
      fields={[
        { key: 'expiry_days', label: 'Expiration (jours)', placeholder: '30' },
      ]}
    />
  );
}
