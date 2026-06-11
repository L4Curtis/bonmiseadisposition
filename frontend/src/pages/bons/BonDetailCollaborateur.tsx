import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDateLong, formatDateTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  Download,
  FileText,
  Building2,
  Package,
  PenTool,
  AlertOctagon,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { ContestationDialog } from '@/components/ContestationDialog';
import type { BonDetailData, PdfSnapshotInfo, EquipmentItem } from './detail/types';
import { equipmentLabel, sigTypeLabel, SNAPSHOT_LABELS } from './detail/types';

// ─── Equipment status badge ─────────────────────────────────────────────────

function EquipmentStatusBadge({ eq }: { eq: EquipmentItem }) {
  if (eq.returnedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" /> Rendu
      </span>
    );
  }
  if (eq.notReturned) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/20 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
        <XCircle className="h-3 w-3" /> Non rendu
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
      <Clock className="h-3 w-3" /> En cours
    </span>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6 ">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export function BonDetailCollaborateurPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [bon, setBon] = useState<BonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfSnapshots, setPdfSnapshots] = useState<PdfSnapshotInfo[]>([]);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [showContestation, setShowContestation] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api.get<BonDetailData>(`/bons/${id}`)
      .then((b) => {
        setBon(b);
        api.get<PdfSnapshotInfo[]>(`/bons/${b.id}/pdf-snapshots`)
          .then(setPdfSnapshots)
          .catch(() => setPdfSnapshots([]));
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Erreur lors du chargement du bon'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const downloadPdf = async (type: string, stage?: string) => {
    if (!bon) return;
    const key = stage ?? type;
    setPdfLoading(key);
    try {
      const params = new URLSearchParams({ type });
      if (stage) params.set('stage', stage);
      const res = await fetch(`/api/bons/${bon.id}/pdf?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur lors du téléchargement');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bon-${bon.reference}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de télécharger le PDF', variant: 'destructive' });
    } finally {
      setPdfLoading(null);
    }
  };

  const handleContestationSuccess = () => {
    toast({ title: 'Contestation envoyée', description: 'Le service IT va traiter votre demande.', variant: 'success' });
    load();
  };

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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Retour à mes bons" onClick={() => navigate('/mes-bons')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono">{bon.reference}</h1>
              <StatusBadge status={bon.status} signatures={bon.signatures} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Créé le {formatDateLong(bon.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canContest && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowContestation(true)}
              className="text-destructive border-destructive/30 hover:bg-destructive/5"
            >
              <AlertOctagon className="mr-1.5 h-3.5 w-3.5" /> Contester
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadPdf('mise_disposition')}
            disabled={!!pdfLoading}
          >
            {pdfLoading === 'mise_disposition' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            PDF
          </Button>
        </div>
      </div>

      {/* ── Info cards ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" /> Filiale & Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Filiale</span>
              <span className="font-medium">{bon.filiale.displayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date mise à disposition</span>
              <span className="font-medium">{formatDateLong(bon.dateMiseDisposition)}</span>
            </div>
            {bon.dateRestitution && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date restitution prévue</span>
                <span className="font-medium">{formatDateLong(bon.dateRestitution)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PenTool className="h-4 w-4 text-muted-foreground" /> Signatures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {bon.signatures
              .filter((s) => s.type !== 'it_cachet')
              .map((sig) => (
                <div key={sig.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{sigTypeLabel(sig.type)}</span>
                  {sig.signed ? (
                    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Signé le {formatDateLong(sig.signedAt)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 text-xs font-medium">
                      <Clock className="h-3 w-3" /> En attente
                    </span>
                  )}
                </div>
              ))}
            {bon.signatures.filter((s) => s.type !== 'it_cachet').length === 0 && (
              <p className="text-muted-foreground text-xs">Aucune signature pour le moment</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Equipments ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Équipements ({bon.equipments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Liste des équipements">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Désignation</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">N° série</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">N° inventaire</th>
                  {showEquipmentStatus && (
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">État</th>
                  )}
                  {bon.equipments.some((e) => e.notes) && (
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Notes</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {bon.equipments.map((eq) => (
                  <tr key={eq.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{equipmentLabel(eq)}</span>
                      {eq.catalogItem?.category && (
                        <span className="ml-2 text-xs text-muted-foreground">({eq.catalogItem.category})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                      {eq.serialNumber || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs hidden md:table-cell">
                      {eq.inventoryNumber || '—'}
                    </td>
                    {showEquipmentStatus && (
                      <td className="px-4 py-2.5">
                        <EquipmentStatusBadge eq={eq} />
                        {eq.notReturned && eq.notReturnedReason && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{eq.notReturnedReason}</p>
                        )}
                      </td>
                    )}
                    {bon.equipments.some((e) => e.notes) && (
                      <td className="px-4 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">
                        {eq.notes || '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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

      {/* ── PDF snapshots ──────────────────────────────────────────────────── */}
      {pdfSnapshots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" /> Documents PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pdfSnapshots.map((snap) => (
              <div key={snap.type} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{SNAPSHOT_LABELS[snap.type] ?? snap.type}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(snap.createdAt)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Télécharger ${SNAPSHOT_LABELS[snap.type] ?? snap.type}`}
                  onClick={() => downloadPdf('mise_disposition', snap.type)}
                  disabled={!!pdfLoading}
                >
                  {pdfLoading === snap.type ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
