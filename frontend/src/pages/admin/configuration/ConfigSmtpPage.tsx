import { api } from '@/lib/api';
import { ConfigSection, SmtpTestButton } from '@/components/admin/ConfigSection';
import type { ConnectionTestResponse } from '@/contracts/admin';

export function ConfigSmtpPage() {
  return (
    <>
      {/* Lot F1 : titre de page caché, cf. ConfigLdapPage. */}
      <h1 className="sr-only">Configuration — Email / SMTP</h1>
      <ConfigSection
        title="Email / SMTP"
        category="smtp"
        fields={[
          { key: 'secure', label: 'TLS/SSL', toggle: true },
          { key: 'host', label: 'Serveur SMTP', placeholder: 'smtp.entreprise.local' },
          { key: 'port', label: 'Port', type: 'number' },
          { key: 'user', label: 'Utilisateur SMTP', placeholder: 'notifications@entreprise.local' },
          { key: 'password', label: 'Mot de passe SMTP', type: 'password', encrypted: true },
          { key: 'from', label: 'Adresse d’expéditeur', placeholder: 'noreply@entreprise.local', type: 'email' },
        ]}
        footer={
          <SmtpTestButton
            onTest={(email) =>
              api.post<ConnectionTestResponse>('/admin/config/test/smtp', { testEmail: email })
            }
          />
        }
      />
    </>
  );
}
