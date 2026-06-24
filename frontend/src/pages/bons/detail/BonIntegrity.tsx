import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Clock } from 'lucide-react';

interface IntegritySig {
  id: string;
  type: string;
  signed: boolean;
  sealed: boolean;
  sealValid: boolean | null;
  timestamped: boolean;
  timestampAuthority: string | null;
  signedAt: string | null;
}
interface IntegrityResult {
  allValid: boolean;
  signatures: IntegritySig[];
}

const TYPE_LABELS: Record<string, string> = {
  it_cachet: 'Cachet IT',
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV de clôture',
};

export function BonIntegrity({ bonId }: { readonly bonId: string }) {
  const [result, setResult] = useState<IntegrityResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<IntegrityResult>(`/bons/${bonId}/integrity`)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [bonId]);

  if (loading || !result || result.signatures.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {result.allValid ? (
            <ShieldCheck className="h-4 w-4 text-green-600" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-red-600" />
          )}
          Intégrité probante des signatures
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {result.allValid
            ? 'Tous les sceaux cryptographiques sont valides — aucune altération détectée.'
            : 'Au moins une signature présente un sceau invalide (altération possible en base).'}
        </p>
        <ul className="space-y-1.5">
          {result.signatures.map((s) => {
            const Icon = s.sealValid === true ? ShieldCheck : s.sealValid === false ? ShieldAlert : ShieldQuestion;
            const color =
              s.sealValid === true ? 'text-green-600' : s.sealValid === false ? 'text-red-600' : 'text-muted-foreground/60';
            return (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                <span className="font-medium text-foreground">{TYPE_LABELS[s.type] ?? s.type}</span>
                <span className={color}>
                  {s.sealValid === true ? 'scellé · valide' : s.sealValid === false ? 'sceau INVALIDE' : 'non scellé'}
                </span>
                {s.timestamped && (
                  <span className="flex items-center gap-1 text-muted-foreground/70" title={s.timestampAuthority ?? ''}>
                    <Clock className="h-3 w-3" /> horodaté RFC 3161
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
