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
          { key: 'delay_1', label: '1er rappel (jours)', placeholder: '3' },
          { key: 'delay_2', label: '2ème rappel (jours)', placeholder: '7' },
          { key: 'delay_3', label: '3ème rappel (jours)', placeholder: '14' },
          {
            key: 'restitution_before_days',
            label: 'Rappel avant restitution (jours)',
            placeholder: '7',
            type: 'number',
            min: 0,
            help: 'Rappel au collaborateur X jours avant la date de restitution prévue (0 = désactivé)',
          },
          {
            key: 'signature_overdue_days',
            label: 'Seuil de retard de signature (jours)',
            placeholder: '7',
            type: 'number',
            min: 1,
            help: 'Un bon en attente de signature depuis plus de N jours est considéré en retard',
          },
        ]}
      />
    </>
  );
}
