import { formatDateLong } from '@/lib/dates';
import { CIVILITE_LONG_LABELS } from '@/domain/labels';
import type { BonInfo } from '../types';
import { pendingRestitutionGroups } from '../lib/restitution-groups';

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
  const civiliteLabel = CIVILITE_LONG_LABELS[bon.civilite];
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
            {isPvCloture ? 'PV de non-restitution à signer' : `Bon de ${sigType} à signer`}
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
        <Row label="Remis le" value={formatDateLong(bon.dateMiseDisposition)} />
        {bon.dateRestitution && <Row label="Retour prévu le" value={formatDateLong(bon.dateRestitution)} />}
      </div>
    </div>
  );
}

type Equipment = BonInfo['equipments'][number];

function equipmentLabel(eq: Equipment): string {
  return eq.catalogItem ? `${eq.catalogItem.brand} ${eq.catalogItem.model}` : eq.customLabel || '—';
}

interface EquipmentCardsProps {
  title: string;
  hint?: string;
  equipments: readonly Equipment[];
  /** Motif du non-restitué affiché sous chaque équipement. */
  showReason?: boolean;
  tone?: 'default' | 'danger';
  /** Mention sous la désignation (« Reste chez vous »…). */
  badge?: string;
  /** Mention neutre (« Déjà rendu » : rien à faire) ou d'attention. */
  badgeTone?: 'primary' | 'muted';
}

/** Liste d'équipements en cartes empilées : lisible sans zoom sur téléphone,
 *  n° de série en entier (jamais coupé ni caché dans un tableau qui défile de
 *  côté), même rendu sur ordinateur. */
const BADGE_TONES = {
  primary: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
} as const;

function EquipmentCards({
  title, hint, equipments, showReason = false, tone = 'default', badge, badgeTone = 'primary',
}: EquipmentCardsProps) {
  return (
    <section className="rounded-xl bg-card border border-border shadow-sm">
      <div className="px-4 sm:px-5 py-3 border-b">
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <ol aria-label={title} className="divide-y">
        {equipments.map((eq, i) => (
          <li key={eq.id} className={`flex gap-3 px-4 sm:px-5 py-3 text-sm ${tone === 'danger' ? 'bg-destructive/10' : ''}`}>
            <span aria-hidden="true" className="w-5 shrink-0 text-muted-foreground/70">{i + 1}</span>
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium text-foreground [overflow-wrap:anywhere]">{equipmentLabel(eq)}</p>
              <p className="text-muted-foreground">
                N° de série{' '}
                <span className="font-mono text-foreground [overflow-wrap:anywhere]">{eq.serialNumber || 'non renseigné'}</span>
              </p>
              {eq.inventoryNumber && (
                <p className="text-muted-foreground">
                  N° d'inventaire <span className="font-mono text-foreground [overflow-wrap:anywhere]">{eq.inventoryNumber}</span>
                </p>
              )}
              {showReason && (
                <p className="text-destructive italic [overflow-wrap:anywhere]">Motif : {eq.notReturnedReason || 'non précisé'}</p>
              )}
              {badge && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[badgeTone]}`}>{badge}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const byOrder = (a: Equipment, b: Equipment) => a.order - b.order;

interface EquipmentTableProps {
  equipments: BonInfo['equipments'];
  isPvCloture: boolean;
}

/** Équipements d'une remise (tous) ou d'un PV (les non restitués). */
export function EquipmentTable({ equipments, isPvCloture }: EquipmentTableProps) {
  // Copie avant tri : sort() modifie le tableau, qui vit dans l'état du parent.
  const sorted = [...equipments].sort(byOrder);
  if (isPvCloture) {
    const declared = sorted.filter((eq) => eq.notReturned);
    return (
      <EquipmentCards
        title={`Équipements non restitués (${declared.length})`}
        hint="Les équipements ci-dessous ont été déclarés non restitués par l'équipe informatique."
        equipments={declared}
        showReason
        tone="danger"
      />
    );
  }
  return <EquipmentCards title={`Équipements (${sorted.length})`} equipments={sorted} />;
}

/**
 * Restitution à signer, découpée comme le PDF : ce qui est rendu CETTE fois
 * (ce que la signature confirme), ce qui l'avait été lors d'une restitution
 * précédente (déjà signée, rappelé pour mémoire), puis ce qui reste chez le
 * collaborateur. Une 2e restitution ne fait jamais re-signer un retour déjà
 * signé.
 */
export function RestitutionTables({ bon }: { bon: BonInfo }) {
  const groups = pendingRestitutionGroups([...bon.equipments].sort(byOrder), bon.signatures ?? []);
  return (
    <>
      <EquipmentCards
        title={`Équipements restitués (${groups.returnedNow.length})`}
        hint="Les équipements ci-dessous sont rendus : votre signature le confirme."
        equipments={groups.returnedNow}
      />
      {groups.returnedBefore.length > 0 && (
        <EquipmentCards
          title={`Déjà restitués (${groups.returnedBefore.length})`}
          hint="Rendus lors d'une restitution précédente, déjà signée : cette signature ne les concerne pas."
          equipments={groups.returnedBefore}
          badge="Déjà rendu"
          badgeTone="muted"
        />
      )}
      {groups.stillHeld.length > 0 && (
        <EquipmentCards
          title={`Encore chez vous (${groups.stillHeld.length})`}
          hint="Ces équipements ne font pas partie de cette restitution : vous les gardez."
          equipments={groups.stillHeld}
          badge="Reste chez vous"
        />
      )}
    </>
  );
}

/** Déclarés non restitués (restitution uniquement) — ces équipements ne
 *  figurent dans aucune des deux autres listes : sans cette section le
 *  collaborateur signerait sans voir l'état complet du bon. */
export function DeclaredNotReturnedTable({ equipments }: { equipments: BonInfo['equipments'] }) {
  const declared = equipments.filter((eq) => eq.notReturned).sort(byOrder);
  if (declared.length === 0) return null;
  return (
    <EquipmentCards
      title={`Déclarés non restitués (${declared.length})`}
      hint="Ces équipements ont été déclarés non restitués par l'équipe informatique et font l'objet d'un traitement séparé."
      equipments={declared}
      showReason
      tone="danger"
    />
  );
}

interface BonSummaryProps {
  bon: BonInfo;
  isPvCloture: boolean;
  isRestitution: boolean;
  sigType: string;
}

/** Récapitulatif complet du bon : en-tête (filiale/destinataire/dates) et
 *  listes d'équipements (principale, puis restants/déclarés non restitués pour
 *  une restitution). */
export function BonSummary({ bon, isPvCloture, isRestitution, sigType }: BonSummaryProps) {
  return (
    <>
      <BonHeaderCard bon={bon} isPvCloture={isPvCloture} sigType={sigType} />
      {isRestitution ? (
        <>
          <RestitutionTables bon={bon} />
          <DeclaredNotReturnedTable equipments={bon.equipments} />
        </>
      ) : (
        <EquipmentTable equipments={bon.equipments} isPvCloture={isPvCloture} />
      )}
    </>
  );
}
