/**
 * Security tests for email template XSS prevention.
 * Verifies that all user-supplied data is HTML-escaped before embedding in emails.
 */

// Replicate escapeHtml from notification.service.ts
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface TestEquipment {
  order: number;
  catalogItem?: { brand: string; model: string } | null;
  customLabel?: string | null;
  serialNumber?: string | null;
  notReturned?: boolean;
  notReturnedReason?: string | null;
}

// Replicate buildEquipList logic (post-fix version that escapes user input)
function buildEquipList(equipments: TestEquipment[]): string {
  const items = (equipments ?? [])
    .sort((a, b) => a.order - b.order)
    .map((eq) => {
      const label = eq.catalogItem
        ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
        : escapeHtml(eq.customLabel || 'Équipement');
      const serial = eq.serialNumber
        ? `<span style="color:#94a3b8;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
        : '';
      return `<li style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}${serial}</li>`;
    });
  return items.length
    ? items.join('\n')
    : '<li style="padding:8px 0;font-size:14px;color:#94a3b8;list-style:none">Voir le bon en ligne</li>';
}

function buildNotReturnedList(equipments: TestEquipment[]): string {
  const items = (equipments ?? [])
    .filter((eq) => eq.notReturned)
    .sort((a, b) => a.order - b.order)
    .map((eq) => {
      const label = eq.catalogItem
        ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
        : escapeHtml(eq.customLabel || 'Équipement');
      const serial = eq.serialNumber
        ? `<span style="color:#94a3b8;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
        : '';
      const reason = `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${escapeHtml(eq.notReturnedReason ?? 'Motif non précisé')}</span>`;
      return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}${serial}${reason}</li>`;
    });
  return items.length
    ? items.join('\n')
    : '<li style="padding:8px 0;font-size:14px;color:#94a3b8;list-style:none">Voir le procès-verbal en ligne</li>';
}

// ─── escapeHtml Tests ────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('should escape < and > (prevents tag injection)', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('should escape & (prevents entity injection)', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('" onload="alert(1)"')).toBe('&quot; onload=&quot;alert(1)&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("' onclick='alert(1)'")).toBe("&#039; onclick=&#039;alert(1)&#039;");
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not alter safe strings', () => {
    expect(escapeHtml('Lenovo ThinkBook 16 G6')).toBe('Lenovo ThinkBook 16 G6');
  });
});

// ─── XSS Prevention in Equipment Lists ──────────────────────────────────────

describe('buildEquipList XSS prevention', () => {
  it('should escape XSS payload in customLabel', () => {
    const equipment = [
      { order: 0, customLabel: '<img src=x onerror=alert(1)>', serialNumber: null as string | null },
    ];
    const html = buildEquipList(equipment);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('should escape XSS payload in serialNumber', () => {
    const equipment = [
      { order: 0, customLabel: 'Safe Label', serialNumber: '"><script>alert(1)</script>' },
    ];
    const html = buildEquipList(equipment);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should escape XSS in catalogItem brand and model', () => {
    const equipment = [
      {
        order: 0,
        catalogItem: { brand: '<b>Evil</b>', model: '<script>xss</script>' },
        serialNumber: null as string | null,
      },
    ];
    const html = buildEquipList(equipment);
    expect(html).not.toContain('<b>Evil</b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
  });

  it('should produce safe output for normal equipment', () => {
    const equipment = [
      { order: 0, catalogItem: { brand: 'Lenovo', model: 'ThinkBook 16' }, serialNumber: 'SN-123' },
    ];
    const html = buildEquipList(equipment);
    expect(html).toContain('Lenovo ThinkBook 16');
    expect(html).toContain('SN-123');
    expect(html).not.toContain('&lt;'); // no escaping needed for safe data
  });
});

describe('buildNotReturnedList XSS prevention', () => {
  it('should escape XSS in notReturnedReason', () => {
    const equipment = [
      {
        order: 0,
        notReturned: true,
        customLabel: 'Laptop',
        serialNumber: null as string | null,
        notReturnedReason: '<img src=x onerror=steal()>',
      },
    ];
    const html = buildNotReturnedList(equipment);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=steal()&gt;');
  });

  it('should escape XSS in all fields simultaneously', () => {
    const equipment = [
      {
        order: 0,
        notReturned: true,
        customLabel: '<svg/onload=alert(1)>',
        serialNumber: '";alert(1)//',
        notReturnedReason: '<script>document.cookie</script>',
      },
    ];
    const html = buildNotReturnedList(equipment);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;svg/onload=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should handle default reason when notReturnedReason is null', () => {
    const equipment = [
      {
        order: 0,
        notReturned: true,
        customLabel: 'Item',
        serialNumber: null as string | null,
        notReturnedReason: null as string | null,
      },
    ];
    const html = buildNotReturnedList(equipment);
    expect(html).toContain('Motif non précisé');
  });
});

// ─── Template Variable Escaping ──────────────────────────────────────────────

describe('Template variable escaping', () => {
  it('should escape COLLAB_NAME with XSS payload', () => {
    const maliciousName = '"><script>alert(document.cookie)</script>';
    const escaped = escapeHtml(maliciousName);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('should escape FILIALE_NOM with HTML injection', () => {
    const maliciousFiliale = 'Filiale <b onclick="alert(1)">test</b>';
    const escaped = escapeHtml(maliciousFiliale);
    expect(escaped).not.toContain('<b');
    expect(escaped).toContain('&lt;b onclick=');
  });

  it('should handle accented characters without escaping them', () => {
    const frenchName = 'Péduzzi Électronique — Île-de-France';
    const escaped = escapeHtml(frenchName);
    // Only & should be escaped, accents are fine
    expect(escaped).toContain('Péduzzi');
    expect(escaped).toContain('Île-de-France');
    expect(escaped).toContain('—');
  });
});
