import type { ReactNode } from 'react';

interface StatusScreenProps {
  icon: ReactNode;
  title: string;
  message: string;
  /** Référence du bon, rappelée sous le message. */
  reference?: string;
  success?: boolean;
  actions?: ReactNode;
}

/** Écran d'état de la page de signature (lien expiré, invalidé, signé…).
 *  Hauteur minimale plutôt que fixe : en paysage sur téléphone, le contenu
 *  défile au lieu d'être coupé. */
export function StatusScreen({ icon, title, message, reference, success, actions }: StatusScreenProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${success ? 'bg-success/10' : 'bg-muted'}`}>
          {icon}
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {reference && <p className="text-xs text-muted-foreground font-mono">Bon {reference}</p>}
        {actions && <div className="pt-2">{actions}</div>}
        <p className="text-xs text-muted-foreground/70">Groupe Livio — Équipe informatique</p>
      </div>
    </div>
  );
}

/** Lien vers le portail, présent sur chaque écran sans issue. */
export function PortalLink({ primary = false }: { primary?: boolean }) {
  return (
    <a
      href="/mes-bons"
      className={
        primary
          ? 'btn-gradient w-full min-h-11 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground'
          : 'w-full min-h-11 inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50'
      }
    >
      Voir mes équipements
    </a>
  );
}
