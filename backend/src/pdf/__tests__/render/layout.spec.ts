import { formatDate, formatDateTime, formatOptionalText, getStatusLabel } from '../../render/layout';

// ─── formatDate / formatDateTime ───────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a date as jj/mm/aaaa in the Europe/Paris timezone', () => {
    expect(formatDate(new Date('2026-03-15T10:00:00Z'))).toBe('15/03/2026');
  });

  it('accepts a date string', () => {
    expect(formatDate('2026-01-01T00:00:00Z')).toBe('01/01/2026');
  });

  it('returns an em dash for a null/falsy date', () => {
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('includes date, time and timezone name', () => {
    const result = formatDateTime(new Date('2026-06-10T09:30:00Z'));
    expect(result).toContain('10/06/2026');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('returns an em dash for a missing timestamp', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });
});

// ─── formatOptionalText ─────────────────────────────────────────────────────────
// Libellé de repli utilisé notamment pour l'email du collaborateur (absent
// pour un compte créé manuellement, cf. User.isManualAccount) : jamais
// "null"/"undefined" ni une ligne vide dans le PDF.

describe('formatOptionalText', () => {
  it('returns the trimmed value when present', () => {
    expect(formatOptionalText('jean.dupont@groupelivio.fr')).toBe('jean.dupont@groupelivio.fr');
    expect(formatOptionalText('  Marketing  ')).toBe('Marketing');
  });

  it('returns an em dash for null/undefined/empty/blank values', () => {
    expect(formatOptionalText(null)).toBe('—');
    expect(formatOptionalText(undefined)).toBe('—');
    expect(formatOptionalText('')).toBe('—');
    expect(formatOptionalText('   ')).toBe('—');
  });
});

// ─── getStatusLabel ─────────────────────────────────────────────────────────────

describe('getStatusLabel', () => {
  it('returns the known French label for a status', () => {
    expect(getStatusLabel('active')).toBe('Actif');
    expect(getStatusLabel('archived')).toBe('Archivé');
  });

  it('falls back to the raw status when unknown', () => {
    expect(getStatusLabel('some_future_status')).toBe('some_future_status');
  });
});
