import {
  buildEquipList,
  buildNotReturnedList,
  buildLoanedEquipList,
} from '../../messages/equipment-lists';

describe('buildEquipList', () => {
  it('renders equipments sorted by order with brand/model label and serial number', () => {
    const html = buildEquipList([
      { id: '2', order: 1, customLabel: null, catalogItem: { brand: 'Dell', model: 'U2723QE' }, serialNumber: 'SN-2' },
      { id: '1', order: 0, catalogItem: { brand: 'Lenovo', model: 'ThinkBook 16' }, serialNumber: null },
    ] as never);

    const firstIndex = html.indexOf('Lenovo ThinkBook 16');
    const secondIndex = html.indexOf('Dell U2723QE');
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(html).toContain('SN-2');
  });

  it('falls back to customLabel when there is no catalogItem', () => {
    const html = buildEquipList([{ id: '1', order: 0, customLabel: 'Souris perso', serialNumber: null }] as never);
    expect(html).toContain('Souris perso');
  });

  it('falls back to "Équipement" when neither catalogItem nor customLabel is set', () => {
    const html = buildEquipList([{ id: '1', order: 0, customLabel: null, serialNumber: null }] as never);
    expect(html).toContain('Équipement');
  });

  it('renders a placeholder line when the list is empty', () => {
    expect(buildEquipList([])).toContain('Voir le bon en ligne');
  });

  it('escapes HTML in labels and serial numbers', () => {
    const html = buildEquipList([
      { id: '1', order: 0, customLabel: '<img src=x onerror=alert(1)>', serialNumber: '"><script>x</script>' },
    ] as never);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
});

describe('buildNotReturnedList', () => {
  it('only includes equipment flagged notReturned, with its reason', () => {
    const html = buildNotReturnedList([
      { id: '1', order: 0, customLabel: 'Laptop volé', notReturned: true, notReturnedReason: 'Volé', serialNumber: null },
      { id: '2', order: 1, customLabel: 'Souris', notReturned: false, serialNumber: null },
    ] as never);
    expect(html).toContain('Laptop volé');
    expect(html).toContain('Volé');
    expect(html).not.toContain('Souris');
  });

  it('defaults the reason to "Motif non précisé" when missing', () => {
    const html = buildNotReturnedList([
      { id: '1', order: 0, customLabel: 'Item', notReturned: true, notReturnedReason: null, serialNumber: null },
    ] as never);
    expect(html).toContain('Motif non précisé');
  });

  it('renders a placeholder line when nothing is not-returned', () => {
    expect(buildNotReturnedList([])).toContain('Voir le procès-verbal en ligne');
  });
});

describe('buildLoanedEquipList', () => {
  it('excludes returned and not-returned equipment, keeping only what is still loaned', () => {
    const html = buildLoanedEquipList([
      { id: '1', order: 0, customLabel: 'Rendu', returnedAt: new Date('2026-01-01'), serialNumber: null },
      { id: '2', order: 1, customLabel: 'Perdu', notReturned: true, serialNumber: null },
      { id: '3', order: 2, customLabel: 'Encore prêté', serialNumber: null },
    ] as never);
    expect(html).toContain('Encore prêté');
    expect(html).not.toContain('Rendu');
    expect(html).not.toContain('Perdu');
  });

  it('renders a placeholder line when nothing is currently loaned', () => {
    expect(buildLoanedEquipList([])).toContain('Voir le bon en ligne');
  });
});
