import { useHostTimeZone } from '../../common/__tests__/helpers/host-time-zone';
import { buildEquipmentHistoryCsv, type EquipmentHistoryCsvRow } from '../equipment-history-csv';

function row(overrides: Partial<EquipmentHistoryCsvRow> = {}): EquipmentHistoryCsvRow {
  return {
    label: 'Lenovo ThinkBook 16 G6',
    serialNumber: 'SN-1234',
    inventoryNumber: 'INV-5678',
    returnedAt: null,
    notReturned: false,
    bon: {
      reference: 'BON-2026-0001',
      status: 'active',
      dateMiseDisposition: new Date('2026-01-05'),
      dateRestitution: null,
      collaborateur: { displayName: 'Jean Dupont', email: 'jean@example.com' },
      filiale: { displayName: 'Siège' },
    },
    ...overrides,
  };
}

describe('buildEquipmentHistoryCsv', () => {
  it('includes the BOM UTF-8 marker, the expected header and the row data', () => {
    const csv = buildEquipmentHistoryCsv([row()]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(
      '"Référence bon";"Statut bon";"Collaborateur";"Email";"Filiale";"Désignation";"N° série";"N° inventaire";"Date mise à disposition";"Restitution prévue";"Restitué le";"Non restitué"',
    );
    expect(csv).toContain('"BON-2026-0001"');
    expect(csv).toContain('"En cours"');
    expect(csv).toContain('"SN-1234"');
    expect(csv).toContain('"INV-5678"');
  });

  it('flags a not-returned equipment with "Oui" in the last column', () => {
    const csv = buildEquipmentHistoryCsv([row({ notReturned: true })]);
    const dataLine = csv.split('\n')[1];

    expect(dataLine.endsWith('"Oui"')).toBe(true);
  });

  it('formats the return date only when the equipment was returned', () => {
    const csv = buildEquipmentHistoryCsv([row({ returnedAt: new Date('2026-02-10') })]);

    expect(csv).toContain('"10/02/2026"');
  });

  it('returns only the header line for an empty history', () => {
    const csv = buildEquipmentHistoryCsv([]);

    expect(csv.split('\n')).toHaveLength(1);
  });
});

describe('buildEquipmentHistoryCsv — date de retour à l’heure de Paris, serveur réglé en UTC', () => {
  useHostTimeZone('UTC');

  it.each([
    ['été', '2026-07-14T22:30:00.000Z', '15/07/2026'],
    ['hiver', '2026-01-14T23:30:00.000Z', '15/01/2026'],
  ])('un retour enregistré entre 0 h et 2 h à Paris porte la date parisienne (%s)', (_season, instant, expected) => {
    const csv = buildEquipmentHistoryCsv([row({ returnedAt: new Date(instant) })]);
    const cells = csv.split('\n')[1].split(';');

    expect(cells[10]).toBe(`"${expected}"`);
  });
});
