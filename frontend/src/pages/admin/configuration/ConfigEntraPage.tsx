import { api } from "@/lib/api";
import {
  ConfigSection,
  type TestResult,
} from "@/components/admin/ConfigSection";
import { SsoDiagnosticCard } from "./SsoDiagnosticCard";

export function ConfigEntraPage() {
  return (
    <div className="space-y-5">
      {/* Lot F1 : titre de page caché, cf. ConfigLdapPage. */}
      <h1 className="sr-only">Configuration — Entra ID (SSO)</h1>
      <ConfigSection
        title="Microsoft Entra ID (SSO)"
        category="entra"
        onTest={() => api.post<TestResult>("/admin/config/test/entra")}
        testLabel="Tester la connexion Entra"
        fields={[
          {
            key: "tenant_id",
            label: "Tenant ID",
            placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
          },
          {
            key: "client_id",
            label: "Client ID (App Registration)",
            placeholder: "xxxxxxxx-...",
          },
          {
            key: "client_secret",
            label: "Client Secret",
            type: "password",
            encrypted: true,
          },
          {
            key: "redirect_uri",
            label: "Redirect URI",
            placeholder: "https://bons.entreprise.local/api/auth/callback",
          },
          {
            key: "admin_group_id",
            label: "Groupe Admin (Object ID)",
            placeholder: "xxxxxxxx-...",
          },
          {
            key: "technician_group_id",
            label: "Groupe Technicien (Object ID)",
            placeholder: "xxxxxxxx-...",
          },
          {
            key: "direction_group_id",
            label: "Groupe Direction (object ID)",
            placeholder: "xxxxxxxx-...",
            help: "Membres = rôle Direction : tableau de bord et inventaire en lecture seule. Les groupes Entra déterminent le rôle à chaque connexion.",
          },
        ]}
      />
      <SsoDiagnosticCard />
    </div>
  );
}
