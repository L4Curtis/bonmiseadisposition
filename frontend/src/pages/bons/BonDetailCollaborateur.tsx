import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, FileText, XCircle } from 'lucide-react';
import { ContestationDialog } from '@/components/ContestationDialog';
import { BonAttachments } from './detail/BonAttachments';
import { DetailSkeleton } from './collaborateur/components/DetailSkeleton';
import { BonHeaderCollab } from './collaborateur/components/BonHeaderCollab';
import { InfoCardsCollab } from './collaborateur/components/InfoCardsCollab';
import { EquipmentTableCollab } from './collaborateur/components/EquipmentTableCollab';
import { PdfSnapshotsCardCollab } from './collaborateur/components/PdfSnapshotsCardCollab';
import { useBonDetailCollaborateur } from './collaborateur/hooks/useBonDetailCollaborateur';

// ─── Page principale ─────────────────────────────────────────────────────────

export function BonDetailCollaborateurPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    bon,
    loading,
    loadError,
    pdfSnapshots,
    pdfLoading,
    showContestation,
    setShowContestation,
    downloadPdf,
    handleContestationSuccess,
  } = useBonDetailCollaborateur(id);

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />;

  if (loadError || !bon) {
    return (
      <div className="">
        <Card className="border-destructive/30">
          <CardContent className="p-8 text-center" role="alert">
            <XCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
            <p className="text-sm text-destructive">{loadError ?? 'Bon introuvable'}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/mes-bons')} className="mt-4">
              <ChevronLeft className="mr-1.5 h-3.5 w-3.5" /> Retour
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canContest = bon.status === 'active';
  const showEquipmentStatus = ['sent_restitution', 'partially_returned', 'archived'].includes(bon.status);

  return (
    <div className="space-y-6 ">
      <BonHeaderCollab
        bon={bon}
        canContest={canContest}
        pdfLoading={pdfLoading}
        onBack={() => navigate('/mes-bons')}
        onContest={() => setShowContestation(true)}
        onDownloadPdf={() => downloadPdf('mise_disposition')}
      />

      <InfoCardsCollab bon={bon} />

      <EquipmentTableCollab bon={bon} showEquipmentStatus={showEquipmentStatus} />

      {/* ── Notes ──────────────────────────────────────────────────────────── */}
      {bon.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Remarques
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bon.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Pièces jointes ─────────────────────────────────────────────────── */}
      <BonAttachments
        bonId={bon.id}
        canManage={false}
        defaultStage={['active', 'sent_restitution', 'partially_returned', 'archived'].includes(bon.status) ? 'restitution' : 'mise_disposition'}
      />

      <PdfSnapshotsCardCollab
        snapshots={pdfSnapshots}
        pdfLoading={pdfLoading}
        onDownload={downloadPdf}
      />

      {/* ── Contestation dialog ────────────────────────────────────────────── */}
      <ContestationDialog
        bonId={bon.id}
        bonRef={bon.reference}
        open={showContestation}
        onOpenChange={(open) => setShowContestation(open)}
        onSuccess={handleContestationSuccess}
      />
    </div>
  );
}
