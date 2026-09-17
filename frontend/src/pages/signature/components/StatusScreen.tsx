import type { ReactNode } from 'react';

interface StatusScreenProps {
  icon: ReactNode;
  title: string;
  message: string;
  success?: boolean;
  actions?: ReactNode;
}

export function StatusScreen({ icon, title, message, success, actions }: StatusScreenProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-muted'}`}>
          {icon}
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {actions && <div className="pt-2">{actions}</div>}
        <p className="text-xs text-muted-foreground/70">Groupe Livio — Service informatique</p>
      </div>
    </div>
  );
}
