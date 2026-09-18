import { Clock, ExternalLink, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { findPendingSignable, signatureTypeLabel } from '../lib/bonsFilters';
import type { BonCollab } from '../types';

interface PendingBonCardProps {
  bon: BonCollab;
  onDetails: (bon: BonCollab) => void;
}

function PendingBonCard({ bon, onDetails }: PendingBonCardProps) {
  const pendingSig = findPendingSignable(bon);
  // Le libellé vient du TYPE de la signature en attente, pas du
  // statut global du bon (un partially_returned peut aussi bien
  // porter une restitution qu'un PV en attente). Si aucune
  // signature signable n'est trouvée (ex : token invalidé entre
  // le chargement et le rendu), on retombe sur une déduction à
  // partir du statut — comme avant l'introduction de pendingSig —
  // plutôt que d'afficher « mise à disposition » par défaut.
  const fallbackType = bon.status === 'partially_returned'
    ? 'pv_cloture'
    : bon.status === 'sent_restitution' ? 'restitution' : 'mise_disposition';
  const sigTypeKey = pendingSig?.type ?? fallbackType;
  const isPvCloture = sigTypeKey === 'pv_cloture';
  const sigType = signatureTypeLabel(sigTypeKey);
  const isInPersonPending = !!pendingSig && (pendingSig.isInPerson || pendingSig.inPersonPending);
  return (
    <Card className="border-warning/30 bg-warning/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">{bon.reference}</span>
            <StatusBadge status={bon.status} signatures={bon.signatures} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDetails(bon)}
            className="text-muted-foreground hover:text-foreground"
          >
            Détails <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-sm text-warning">
          Bon de <strong>{sigType}</strong> en attente de signature.
        </p>
        {isInPersonPending ? (
          <span className="text-xs text-muted-foreground">
            Signature en présentiel en cours avec le service informatique
          </span>
        ) : pendingSig?.token ? (
          <Button asChild className="bg-warning hover:bg-warning/90 text-warning-foreground">
            <a href={'/signer/' + pendingSig.token}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Signer maintenant
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Lien non disponible — contactez le service IT</span>
        )}
      </CardContent>
    </Card>
  );
}

interface PendingBonsSectionProps {
  bons: BonCollab[];
  onDetails: (bon: BonCollab) => void;
}

export function PendingBonsSection({ bons, onDetails }: PendingBonsSectionProps) {
  return (
    <section id="a-signer">
      <h2 className="text-sm font-semibold text-warning uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" /> À signer ({bons.length})
      </h2>
      <div className="space-y-3">
        {bons.map((bon) => (
          <PendingBonCard key={bon.id} bon={bon} onDetails={onDetails} />
        ))}
      </div>
    </section>
  );
}
