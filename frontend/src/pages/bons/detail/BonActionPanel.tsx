import { useNavigate } from 'react-router';
import {
  AlertTriangle, Ban, ChevronDown, Copy, Download, FileX, Loader2, type LucideIcon, Mail, PackageCheck,
  Pencil, RotateCcw, Send, Smartphone, Undo2, UserCheck,
} from 'lucide-react';
import type { BonActionName, BonAvailableAction } from '@/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DANGEROUS_ACTIONS, actionLabel, nextStepSentence } from './bon-lexicon';
import { placeActions } from './action-placement';
import { BonActionNotices, HandleContestationButton } from './BonActionNotices';
import { PendingLinkLine } from './PendingLinkLine';
import type { BonFiche } from './types';

const ACTION_ICONS: Readonly<Record<BonActionName, LucideIcon>> = {
  edit: Pencil,
  send: Send,
  send_in_person: Smartphone,
  resend: Mail,
  show_in_person_link: Smartphone,
  start_restitution: RotateCcw,
  restitution_in_person: Smartphone,
  undo_return: Undo2,
  declare_not_returned: AlertTriangle,
  mark_found: PackageCheck,
  handover_without_signature: UserCheck,
  close_without_signature: FileX,
  cancel: Ban,
};

/** Bouton d'une action de premier plan : 44 px de haut au moins au doigt. */
const TOUCH = 'max-sm:min-h-11 max-sm:text-sm';
/** Action dangereuse : contour rouge foncé et icône (la confirmation vient de sa fenêtre). */
const DANGER_OUTLINE = 'border-destructive/70 text-destructive hover:bg-destructive/10 hover:text-destructive';

export interface BonActionPanelProps {
  readonly bon: BonFiche;
  readonly actionLoading: string | null;
  readonly pdfLoading: string | null;
  readonly onRun: (action: BonActionName) => void;
  readonly onDownloadPdf: () => void;
}

function ActionButton({ entry, label, primary, busy, onRun }: {
  entry: BonAvailableAction; label: string; primary: boolean; busy: boolean; onRun: (a: BonActionName) => void;
}) {
  const Icon = ACTION_ICONS[entry.action];
  const danger = DANGEROUS_ACTIONS.has(entry.action);
  return (
    <Button
      size="sm"
      variant={primary ? 'default' : 'outline'}
      className={`${TOUCH} ${primary ? 'max-sm:w-full' : ''} ${danger && !primary ? DANGER_OUTLINE : ''}`}
      disabled={busy || !!entry.blockedReason}
      title={entry.blockedReason ?? undefined}
      onClick={() => onRun(entry.action)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

/**
 * « À faire maintenant » : ce que l'équipe informatique a à faire sur ce bon,
 * l'action principale en évidence, les autres à côté ou dans « Autres
 * actions ». Les actions et leur éventuel blocage viennent du serveur
 * (machine à états) ; un blocage est dit en clair sous les boutons.
 */
export function BonActionPanel({ bon, actionLoading, pdfLoading, onRun, onDownloadPdf }: BonActionPanelProps) {
  const navigate = useNavigate();
  const actions = bon.availableActions ?? [];
  const busy = actionLoading !== null;
  const { primary, inline, more } = placeActions(bon);
  // Bon contesté : la décision se prend sur l'écran des contestations.
  const openContestation = bon.contestation?.stage === 'open' ? bon.contestation : null;
  const contestationOpen = openContestation !== null;
  // Un envoi impossible faute de lien est déjà expliqué par le bandeau de la
  // fiche (compte désactivé, pas d'adresse) : on ne répète que les autres motifs.
  const blocked = actions.filter((a) => a.blockedReason && !(bon.linkRefusal && a.blockedReason === bon.linkRefusal.message));
  const sentence = nextStepSentence(bon);

  return (
    <Card className={primary || contestationOpen ? 'border-l-4 border-l-primary' : undefined}>
      <CardContent className="space-y-3 p-4">
        {sentence && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{primary || contestationOpen ? 'À faire maintenant' : 'Où en est ce bon'}</p>
            <p className="text-sm text-muted-foreground">{sentence}</p>
            <PendingLinkLine pending={bon.pendingSignature} />
          </div>
        )}
        <BonActionNotices bon={bon} />
        <div className="flex flex-wrap items-center gap-2">
          {actionLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Action en cours" />}
          {openContestation && <HandleContestationButton contestationId={openContestation.id} className={`${TOUCH} max-sm:w-full`} />}
          {primary && <ActionButton entry={primary} label={actionLabel(primary.action, bon)} primary busy={busy} onRun={onRun} />}
          {inline.map((entry) => (
            <ActionButton key={entry.action} entry={entry} label={actionLabel(entry.action, bon)} primary={false} busy={busy} onRun={onRun} />
          ))}
          <Button variant="outline" size="sm" className={TOUCH} onClick={onDownloadPdf} disabled={pdfLoading === 'header'}>
            {pdfLoading === 'header'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" className={TOUCH} onClick={() => navigate(`/bons/new?duplicateFrom=${bon.id}`)}
            title="Créer un nouveau bon avec les mêmes articles">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Dupliquer
          </Button>
          {more.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={TOUCH} disabled={busy}>
                  Autres actions <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[16rem]">
                {more.map((entry) => {
                  const Icon = ACTION_ICONS[entry.action];
                  const danger = DANGEROUS_ACTIONS.has(entry.action);
                  return (
                    <DropdownMenuItem
                      key={entry.action}
                      disabled={!!entry.blockedReason}
                      className={`min-h-11 gap-2 sm:min-h-9 ${danger ? 'text-destructive focus:bg-destructive/10 focus:text-destructive' : ''}`}
                      onSelect={() => onRun(entry.action)}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {actionLabel(entry.action, bon)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {blocked.map((entry) => (
          <p key={entry.action} className="text-xs text-muted-foreground">
            <span className="font-medium">{actionLabel(entry.action, bon)} impossible :</span> {entry.blockedReason}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
