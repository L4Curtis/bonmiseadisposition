import { formatDate } from '../lib/formatDate';
import type { BonInfo } from '../types';

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-28 sm:w-32 shrink-0">{label}</span>
      {/* overflow-wrap:anywhere plutôt que break-all : un nom ou une adresse
          trop longs passent à la ligne sans couper chaque mot au milieu
          (« COMPAGNO / N3 » sur téléphone). */}
      <span className="text-foreground font-medium [overflow-wrap:anywhere] min-w-0">{value}</span>
    </div>
  );
}

interface BonHeaderCardProps {
  bon: BonInfo;
  isPvCloture: boolean;
  sigType: string;
}

/** Carte d'en-tête (filiale, destinataire, dates) affichée au-dessus des
 *  listes d'équipements. */
export function BonHeaderCard({ bon, isPvCloture, sigType }: BonHeaderCardProps) {
  const civiliteLabel = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
  return (
    <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
      <div
        className="relative px-4 py-4 sm:px-6 sm:py-5 overflow-hidden"
        style={{
          background: isPvCloture
            ? 'linear-gradient(135deg, hsl(0 72% 38%), hsl(0 74% 50%))'
            : 'var(--gradient-primary)',
        }}
      >
        <div aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <p className="text-primary-foreground/80 text-xs font-semibold uppercase tracking-[0.14em] mb-1">
            {bon.filiale.displayName}
          </p>
          <h1 className="text-primary-foreground font-bold text-lg tracking-tight">
            {isPvCloture ? 'Procès-verbal à signer' : `Bon de ${sigType} à signer`}
          </h1>
          <p className="text-primary-foreground/80 text-sm font-mono mt-1">{bon.reference}</p>
        </div>
      </div>
      <div className="px-4 py-4 sm:px-6 space-y-2 text-sm">
        <Row label="Destinataire" value={`${civiliteLabel} ${bon.collaborateur.displayName}`} />
        {/* Collaborateur sans adresse (compagnon de chantier) : pas de ligne vide. */}
        {bon.collaborateurEmail && <Row label="Email" value={bon.collaborateurEmail} />}
        {bon.collaborateur.department && <Row label="Service" value={bon.collaborateur.department} />}
        <Row label="Filiale" value={bon.filiale.displayName} />
        <Row label="Date mise à dispo" value={formatDate(bon.dateMiseDisposition)} />
        {bon.dateRestitution && <Row label="Date restitution" value={formatDate(bon.dateRestitution)} />}
      </div>
    </div>
  );
}

interface EquipmentTableProps {
  equipments: BonInfo['equipments'];
  isPvCloture: boolean;
  isRestitution: boolean;
}

export function EquipmentTable({ equipments, isPvCloture, isRestitution }: EquipmentTableProps) {
  // Copy before sorting — sort() mutates in place and the array lives in the
  // parent component's state
  const filtered = [...equipments]
    .sort((a, b) => a.order - b.order)
    .filter(eq => {
      if (isPvCloture) return eq.notReturned;
      if (isRestitution) return !!eq.returnedAt;
      return true;
    });

  return (
    <div className="rounded-xl bg-card border border-border shadow-sm">
      <div className="px-5 py-3 border-b">
        <h2 className="font-semibold text-sm text-foreground">
          {isPvCloture
            ? `Équipements non restitués (${filtered.length})`
            : isRestitution
              ? `Équipements restitués (${filtered.length})`
              : `Équipements (${filtered.length})`}
        </h2>
        {isPvCloture && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Les équipements ci-dessous ont été déclarés non restitués par le service informatique.
          </p>
        )}
        {isRestitution && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Les équipements ci-dessous sont en cours de restitution.
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Liste des équipements">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">Désignation</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">N° Série</th>
            {isPvCloture && <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">Motif</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.map((eq, i) => {
            const label = eq.catalogItem
              ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
              : eq.customLabel || '—';
            return (
              <tr key={eq.id} className={`border-t ${isPvCloture ? 'bg-destructive/10' : ''}`}>
                <td className="px-3 py-2 sm:px-4 text-muted-foreground/70">{i + 1}</td>
                <td className="px-3 py-2 sm:px-4 font-medium">{label}</td>
                <td className="px-3 py-2 sm:px-4 font-mono text-xs text-muted-foreground">
                  {eq.serialNumber || <span className="text-muted-foreground/30">—</span>}
                </td>
                {isPvCloture && (
                  <td className="px-3 py-2 sm:px-4 text-xs text-destructive italic">
                    {eq.notReturnedReason || '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

interface RemainingEquipmentTableProps {
  equipments: BonInfo['equipments'];
}

/** Éléments restants sur le bon (restitution uniquement) — ne font pas
 *  partie de cette restitution et restent attribués. */
export function RemainingEquipmentTable({ equipments }: RemainingEquipmentTableProps) {
  const remaining = equipments
    .filter(eq => !eq.returnedAt && !eq.notReturned)
    .sort((a, b) => a.order - b.order);
  if (remaining.length === 0) return null;
  return (
    <div className="rounded-xl bg-card border border-border shadow-sm">
      <div className="px-5 py-3 border-b">
        <h2 className="font-semibold text-sm text-foreground">
          Éléments restants sur ce bon ({remaining.length})
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ces équipements ne font pas partie de cette restitution et restent attribués.
        </p>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Équipements restants">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">Désignation</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">N° Série</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">Statut</th>
          </tr>
        </thead>
        <tbody>
          {remaining.map((eq, i) => {
            const label = eq.catalogItem
              ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
              : eq.customLabel || '—';
            return (
              <tr key={eq.id} className="border-t">
                <td className="px-3 py-2 sm:px-4 text-muted-foreground/70">{i + 1}</td>
                <td className="px-3 py-2 sm:px-4 font-medium">{label}</td>
                <td className="px-3 py-2 sm:px-4 font-mono text-xs text-muted-foreground">
                  {eq.serialNumber || <span className="text-muted-foreground/30">—</span>}
                </td>
                <td className="px-3 py-2 sm:px-4">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    En service
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

interface DeclaredNotReturnedTableProps {
  equipments: BonInfo['equipments'];
}

/** Déclarés non rendus (restitution uniquement) — ces équipements ne
 *  figurent dans aucune des deux autres tables : sans cette section le
 *  collaborateur signerait sans voir l'état complet du bon. */
export function DeclaredNotReturnedTable({ equipments }: DeclaredNotReturnedTableProps) {
  const declared = equipments
    .filter(eq => eq.notReturned)
    .sort((a, b) => a.order - b.order);
  if (declared.length === 0) return null;
  return (
    <div className="rounded-xl bg-card border border-border shadow-sm">
      <div className="px-5 py-3 border-b">
        <h2 className="font-semibold text-sm text-foreground">
          Déclarés non rendus ({declared.length})
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ces équipements ont été déclarés non restitués par le service informatique et font l'objet d'un traitement séparé.
        </p>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Équipements déclarés non rendus">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">Désignation</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">N° Série</th>
            <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-muted-foreground">Motif</th>
          </tr>
        </thead>
        <tbody>
          {declared.map((eq, i) => {
            const label = eq.catalogItem
              ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
              : eq.customLabel || '—';
            return (
              <tr key={eq.id} className="border-t bg-destructive/10">
                <td className="px-3 py-2 sm:px-4 text-muted-foreground/70">{i + 1}</td>
                <td className="px-3 py-2 sm:px-4 font-medium">{label}</td>
                <td className="px-3 py-2 sm:px-4 font-mono text-xs text-muted-foreground">
                  {eq.serialNumber || <span className="text-muted-foreground/30">—</span>}
                </td>
                <td className="px-3 py-2 sm:px-4 text-xs text-destructive italic">
                  {eq.notReturnedReason || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

interface BonSummaryProps {
  bon: BonInfo;
  isPvCloture: boolean;
  isRestitution: boolean;
  sigType: string;
}

/** Récapitulatif complet du bon : en-tête (filiale/destinataire/dates) et
 *  listes d'équipements (principale, puis restants/déclarés non rendus pour
 *  une restitution). */
export function BonSummary({ bon, isPvCloture, isRestitution, sigType }: BonSummaryProps) {
  return (
    <>
      <BonHeaderCard bon={bon} isPvCloture={isPvCloture} sigType={sigType} />
      <EquipmentTable equipments={bon.equipments} isPvCloture={isPvCloture} isRestitution={isRestitution} />
      {isRestitution && <RemainingEquipmentTable equipments={bon.equipments} />}
      {isRestitution && <DeclaredNotReturnedTable equipments={bon.equipments} />}
    </>
  );
}
