import { Link } from 'react-router';
import { Loader2, Send } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { Bon } from './types';
import { formatTimeAgo } from './relativeTime';
import { canResendLink, lastLinkSentAt } from './resendEligibility';

export interface BonRowProps {
  readonly bon: Bon;
  readonly selected: boolean;
  readonly onToggleSelected: (id: string) => void;
  readonly onResend: (bon: Bon) => void;
  readonly resendLoading: boolean;
  /** Une relance (ligne ou groupée) est en cours : les autres attendent. */
  readonly resendDisabled: boolean;
}

/** Au-dessus du lien étiré qui couvre la ligne : case à cocher et boutons
 *  restent cliquables sans ouvrir le bon. */
const ABOVE_ROW_LINK = 'relative z-10';

function resendTitle(bon: Bon): string {
  const sentAt = lastLinkSentAt(bon);
  return sentAt
    ? `Renvoyer le lien de signature (dernier envoi ${formatTimeAgo(sentAt)})`
    : 'Renvoyer le lien de signature';
}

/** Ligne de la liste des bons. Toute la ligne ouvre le bon : le lien de la
 *  référence est étiré sur la ligne (pseudo-élément ::after), c'est donc un
 *  vrai lien — clic du milieu et Ctrl+clic ouvrent un nouvel onglet, et il
 *  reste un seul arrêt de tabulation par bon. */
export function BonRow({ bon, selected, onToggleSelected, onResend, resendLoading, resendDisabled }: BonRowProps) {
  const resendable = canResendLink(bon);

  return (
    <tr className={`relative hover:bg-muted/40 transition-colors group ${selected ? 'bg-[hsl(var(--primary)/0.05)]' : ''}`}>
      <td className="w-10 pl-4 pr-0 py-3.5">
        <input
          type="checkbox"
          className={`${ABOVE_ROW_LINK} h-4 w-4 cursor-pointer rounded border-border accent-[hsl(var(--primary))]`}
          checked={selected}
          onChange={() => onToggleSelected(bon.id)}
          aria-label={`Sélectionner le bon ${bon.reference}`}
        />
      </td>

      <td className="px-4 py-3.5">
        <Link
          to={`/bons/${bon.id}`}
          className="inline-block bg-muted text-foreground/80 font-mono text-xs font-medium px-2 py-0.5 rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          aria-label={`Ouvrir le bon ${bon.reference} — ${bon.collaborateur.displayName}`}
        >
          {bon.reference}
        </Link>
      </td>

      <td className="px-4 py-3.5">
        <div className="font-medium text-foreground leading-tight">{bon.collaborateur.displayName}</div>
        <div className="text-xs text-muted-foreground/70 mt-0.5">{bon.collaborateur.email ?? 'Sans adresse email'}</div>
      </td>

      <td className="px-4 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
        {bon.filiale.displayName}
      </td>

      <td className="px-4 py-3.5 text-sm text-muted-foreground hidden lg:table-cell whitespace-nowrap">
        {formatDate(bon.dateMiseDisposition)}
      </td>

      <td className="px-4 py-3.5 text-center hidden sm:table-cell">
        <span className="inline-block text-xs bg-[hsl(var(--primary)/0.08)] dark:bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] font-medium px-2 py-0.5 rounded-full">
          {bon.equipments.length}
        </span>
      </td>

      <td className="px-4 py-3.5">
        <StatusBadge status={bon.status} signatures={bon.signatures} size="md" />
      </td>

      <td className="px-4 py-3.5 text-sm text-muted-foreground hidden md:table-cell whitespace-nowrap">
        <time dateTime={bon.updatedAt} title={`Dernière activité le ${formatDateTime(bon.updatedAt)}`}>
          {formatTimeAgo(bon.updatedAt)}
        </time>
      </td>

      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        {resendable ? (
          <button
            type="button"
            onClick={() => onResend(bon)}
            disabled={resendDisabled}
            title={resendTitle(bon)}
            aria-label={`Relancer le lien de signature du bon ${bon.reference}`}
            className={`${ABOVE_ROW_LINK} inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.08)] disabled:opacity-40 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {resendLoading
              ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              : <Send aria-hidden="true" className="h-3.5 w-3.5" />}
            Relancer
          </button>
        ) : (
          <span aria-hidden="true" className="text-xs text-muted-foreground/70 group-hover:text-[hsl(var(--primary))] font-medium transition-colors">
            Voir
          </span>
        )}
      </td>
    </tr>
  );
}
