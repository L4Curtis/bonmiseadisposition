import { ConfigSection } from '@/components/admin/ConfigSection';

export function ConfigRappelsPage() {
  return (
    <>
      {/* Lot F1 : titre de page caché, cf. ConfigLdapPage. */}
      <h1 className="sr-only">Configuration — Rappels</h1>
      <ConfigSection
        title="Rappels automatiques"
        category="rappels"
        fields={[
          { key: 'enabled', label: 'Activé', toggle: true },
          { key: 'delay_1', label: '1er rappel (jours)', type: 'number' },
          { key: 'delay_2', label: '2e rappel (jours)', type: 'number' },
          { key: 'delay_3', label: '3e rappel (jours)', type: 'number' },
          {
            key: 'restitution_before_days',
            label: 'Rappel avant restitution (jours)',
            type: 'number',
            help: 'Rappel au collaborateur X jours avant la date de restitution prévue (0 = désactivé)',
          },
          {
            key: 'signature_overdue_days',
            label: 'Seuil de retard de signature (jours)',
            type: 'number',
            help: 'Un bon en attente de signature depuis plus de N jours est considéré en retard',
          },
        ]}
      />
    </>
  );
}
