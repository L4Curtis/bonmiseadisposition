import { api } from '@/lib/api';
import { ConfigSection, SmtpTestButton, type TestResult } from '@/components/admin/ConfigSection';

export function ConfigSmtpPage() {
  return (
    <ConfigSection
      title="Email / SMTP"
      category="smtp"
      fields={[
        { key: 'secure', label: 'TLS/SSL', toggle: true },
        { key: 'host', label: 'Serveur SMTP', placeholder: 'smtp.entreprise.local' },
        { key: 'port', label: 'Port', placeholder: '587' },
        { key: 'user', label: 'Utilisateur SMTP', placeholder: 'notifications@entreprise.local' },
        { key: 'password', label: 'Mot de passe SMTP', type: 'password', encrypted: true },
        { key: 'from', label: 'Adresse From', placeholder: 'IT <noreply@entreprise.local>' },
      ]}
      footer={
        <SmtpTestButton
          onTest={(email) =>
            api.post<TestResult>('/admin/config/test/smtp', { testEmail: email })
          }
        />
      }
    />
  );
}
