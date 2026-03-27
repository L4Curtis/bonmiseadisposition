import { ConfigSection } from '@/components/admin/ConfigSection';

export function ConfigRappelsPage() {
  return (
    <ConfigSection
      title="Rappels automatiques"
      category="rappels"
      fields={[
        { key: 'enabled', label: 'Activé', toggle: true },
        { key: 'delay_1', label: '1er rappel (jours)', placeholder: '3' },
        { key: 'delay_2', label: '2ème rappel (jours)', placeholder: '7' },
        { key: 'delay_3', label: '3ème rappel (jours)', placeholder: '14' },
      ]}
    />
  );
}
