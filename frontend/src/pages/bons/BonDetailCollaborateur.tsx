import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AlertOctagon, ChevronLeft, FileText, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ContestationDialog } from '@/components/ContestationDialog';
import type { LinkSignatureType } from '@/contracts/bons';
import { DocumentCard } from '@/pages/portail/components/ToSignSection';
import { documentCardTitle } from '@/pages/portail/lib/portal-labels';
import { DetailSkeleton } from './collaborateur/components/DetailSkeleton';
import { CollabBonHeader } from './collaborateur/components/CollabBonHeader';
import { MyContestationCard } from './collaborateur/components/MyContestationCard';
import { CollabEquipmentList } from './collaborateur/components/CollabEquipmentList';
import { CollabAttachments } from './collaborateur/components/CollabAttachments';
import { CollabDatesAndSignatures, CollabDocuments } from './collaborateur/components/CollabBonSummary';
import { useBonDetailCollaborateur } from './collaborateur/hooks/useBonDetailCollaborateur';

const PENDING_CONTESTATION = new Set(['open', 'in_review']);

// ─── Fiche d'un bon vue par son titulaire ────────────────────────────────────

export function BonDetailCollaborateurPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const detail = useBonDetailCollaborateur(id);
  const [contestDocument, setContestDocument] = useState<LinkSignatureType>('mise_disposition');
  const { bon, toSign, contestation } = detail;

  if (detail.loading) return <DetailSkeleton />;

  if (detail.loadError || !bon) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-8 text-center" role="alert">
          <XCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
          <p className="text-sm text-destructive">{detail.loadError ?? 'Bon introuvable'}</p>
          <Button variant="outline" onClick={() => navigate('/mes-equipements')} className="mt-4 min-h-11">
            <ChevronLeft className="mr-1.5 h-4 w-4" /> Mes équipements
          </Button>
        </CardContent>
      </Card>
    );
  }

  const contestationPending = !!contestation && PENDING_CONTESTATION.has(contestation.status);
  // La remise se conteste une fois le matériel reçu (pas sur un bon déjà en
  // cours de remplacement) ; restitution et PV au moment de les signer.
  const canContestHandover = bon.status === 'active' && !contestationPending && !bon.replacedBy;
  const openContestation = (document: LinkSignatureType) => {
    setContestDocument(document);
    detail.setShowContestation(true);
  };

  return (
    <div className="space-y-5">
      <CollabBonHeader bon={bon} statusText={toSign?.underCorrection ? documentCardTitle(toSign) : undefined} />

      {toSign && (
        <DocumentCard doc={toSign} showBonLink={false} onContest={(target) => openContestation(target.document)} />
      )}

      {contestation && (
        <MyContestationCard contestation={contestation} outcomeShownAbove={toSign?.underCorrection ?? false} />
      )}

      {canContestHandover && (
        <button
          type="button"
          onClick={() => openContestation('mise_disposition')}
          className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 px-4 text-sm font-semibold text-destructive hover:bg-destructive/5 sm:w-auto"
        >
          <AlertOctagon className="h-4 w-4" /> Contester
        </button>
      )}

      <CollabEquipmentList bon={bon} underCorrection={toSign?.underCorrection ?? false} />

      <CollabDatesAndSignatures bon={bon} />

      <CollabDocuments snapshots={detail.pdfSnapshots} pdfLoading={detail.pdfLoading} onOpen={detail.openPdf} />

      {bon.notes && (
        <section className="rounded-xl border bg-card p-4 shadow-sm space-y-1">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" /> Remarques
          </h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{bon.notes}</p>
        </section>
      )}

      <CollabAttachments bonId={bon.id} status={bon.status} />

      <ContestationDialog
        bonId={bon.id}
        bonRef={bon.reference}
        document={contestDocument}
        open={detail.showContestation}
        onOpenChange={detail.setShowContestation}
        onSuccess={detail.handleContestationSuccess}
      />
    </div>
  );
}
