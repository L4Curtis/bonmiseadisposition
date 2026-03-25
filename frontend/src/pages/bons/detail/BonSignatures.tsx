import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Clock,
  User,
  Stamp,
  AlertTriangle,
  Download,
  Loader2,
} from 'lucide-react';
import { formatDateLong, formatDateTime } from '@/lib/utils';
import type { SignatureInfo } from './types';
import { sigTypeLabel } from './types';

export interface BonSignaturesProps {
  readonly signatures: SignatureInfo[];
  readonly pdfLoading: string | null;
  readonly onDownloadPdf: (pdfType: 'mise_disposition' | 'restitution', loadingKey: string) => void;
}

function sigPdfType(sigType: string): 'mise_disposition' | 'restitution' {
  return sigType === 'restitution' ? 'restitution' : 'mise_disposition';
}

export function BonSignatures({ signatures, pdfLoading, onDownloadPdf }: BonSignaturesProps) {
  const visibleSignatures = signatures.filter(
    (sig) => sig.signed || new Date(sig.tokenExpiresAt).getTime() > 1000,
  );

  if (visibleSignatures.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Signatures</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {visibleSignatures.map((sig) => (
          <div
            key={sig.id}
            className={`flex items-start gap-3 rounded-lg p-3 ${sig.signed ? 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30' : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30'}`}
          >
            {sig.signed
              ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              : <Clock className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />}
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{sigTypeLabel(sig.type)}</span>
                {sig.isInPerson && (
                  <span className="text-xs bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Présentiel</span>
                )}
                {sig.type === 'it_cachet' && (
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Stamp className="h-3 w-3" /> IT
                  </span>
                )}
                {sig.type === 'pv_cloture' && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> PV
                  </span>
                )}
              </div>
              {sig.signed ? (
                <div className="text-muted-foreground text-xs mt-0.5 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    <span>{sig.signerEmail}</span>
                  </div>
                  <div>Signé le {formatDateTime(sig.signedAt)}</div>
                  {sig.mentionLuApprouve && <div className="text-green-600">✓ Lu et approuvé</div>}
                </div>
              ) : (
                <p className="text-orange-600 text-xs mt-0.5">
                  En attente · Expire le {formatDateLong(sig.tokenExpiresAt)}
                </p>
              )}
            </div>

            {/* Bouton PDF par étape */}
            {sig.signed && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-foreground h-7 px-2"
                onClick={() => onDownloadPdf(sigPdfType(sig.type), `sig-${sig.id}`)}
                disabled={pdfLoading === `sig-${sig.id}`}
                title={`Télécharger le PDF — ${sigTypeLabel(sig.type)}`}
                aria-label={`Télécharger le PDF — ${sigTypeLabel(sig.type)}`}
              >
                {pdfLoading === `sig-${sig.id}`
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  : <Download className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
