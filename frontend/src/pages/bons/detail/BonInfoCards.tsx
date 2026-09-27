import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateLong } from '@/lib/utils';
import { CIVILITE_LABELS } from '@/domain/labels';
import type { BonFiche } from './types';

export interface BonInfoCardsProps {
  readonly bon: BonFiche;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 text-muted-foreground/70 sm:w-28">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Collaborateur et dates. L'adresse affichée est celle du compte, à laquelle
 *  partent les liens (R-008) ; celle du bon reste une trace. */
export function BonInfoCards({ bon }: BonInfoCardsProps) {
  const accountEmail = bon.collaborateur.email;
  const emailChanged = !!bon.collaborateurEmail && bon.collaborateurEmail !== accountEmail;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card className="card-accent-top">
        <CardHeader><CardTitle className="text-sm">Collaborateur</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Nom"><span className="font-medium">{CIVILITE_LABELS[bon.civilite]} {bon.collaborateur.displayName}</span></Row>
          <Row label="Email">
            {accountEmail ?? <span className="text-muted-foreground">Sans adresse email</span>}
            {emailChanged && (
              <span className="block text-xs text-muted-foreground">Adresse lors de la création du bon : {bon.collaborateurEmail}</span>
            )}
          </Row>
          {bon.collaborateur.department && <Row label="Service">{bon.collaborateur.department}</Row>}
        </CardContent>
      </Card>

      <Card className="card-accent-top">
        <CardHeader><CardTitle className="text-sm">Filiale et dates</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Filiale"><span className="font-medium">{bon.filiale.displayName}</span></Row>
          <Row label="Remise">{formatDateLong(bon.dateMiseDisposition)}</Row>
          {bon.dateRestitution && <Row label="Restitution prévue">{formatDateLong(bon.dateRestitution)}</Row>}
        </CardContent>
      </Card>
    </div>
  );
}
