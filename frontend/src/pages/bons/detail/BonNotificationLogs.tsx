import { CheckCircle, XCircle, Mail } from 'lucide-react';
import type { NotificationLog } from './types';

const TYPE_LABELS: Record<string, string> = {
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV clôture',
  reminder: 'Rappel',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  logs: NotificationLog[];
}

export function BonNotificationLogs({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Historique des emails
        </div>
        <p className="text-sm text-muted-foreground">Aucun email envoyé pour ce bon.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Mail className="h-4 w-4 text-muted-foreground" />
        Historique des emails
      </div>
      <ul className="divide-y divide-border text-sm">
        {logs.map((log) => (
          <li key={log.id} className="py-2 flex items-start gap-3">
            {log.status === 'sent' ? (
              <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                <span className="font-medium">
                  {TYPE_LABELS[log.type] ?? log.type}
                  {log.reminderNumber ? ` (rappel ${log.reminderNumber})` : ''}
                </span>
                <span className="text-muted-foreground truncate">{log.recipientEmail}</span>
                <span className="text-muted-foreground ml-auto whitespace-nowrap">{formatDate(log.sentAt)}</span>
              </div>
              {log.status === 'failed' && log.errorMessage && (
                <p className="mt-1 text-red-600 text-xs break-all">{log.errorMessage}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
