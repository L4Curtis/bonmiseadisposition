import { api } from '@/lib/api';
import { ConfigSection, type TestResult } from '@/components/admin/ConfigSection';

export function ConfigSmbPage() {
  return (
    <ConfigSection
      title="Export SMB (Partage réseau)"
      category="smb"
      onTest={() => api.post<TestResult>('/admin/config/test/smb')}
      testLabel="Tester la connexion SMB"
      fields={[
        { key: 'enabled', label: 'Export SMB activé', toggle: true },
        { key: 'path', label: 'Chemin UNC ou montage local', placeholder: '\\\\serveur\\partage\\bons ou /mnt/partage' },
        { key: 'username', label: 'Utilisateur', placeholder: 'DOMAINE\\utilisateur' },
        { key: 'password', label: 'Mot de passe', type: 'password', encrypted: true },
        { key: 'domain', label: 'Domaine', placeholder: 'ENTREPRISE' },
      ]}
      footer={
        <p className="text-xs text-muted-foreground mt-2">
          Sur Windows, les chemins UNC utilisent la session courante. Sur Docker, le partage doit être monté via mount.cifs ou volume.
        </p>
      }
    />
  );
}
