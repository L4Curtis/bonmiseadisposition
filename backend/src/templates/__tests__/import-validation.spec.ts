import { filterValidImportItems } from '../import-validation';

const KNOWN_IDS = ['mise_disposition_request', 'confirmation_restitution', 'contestation_alert'];
const SIGNER_REQUIRED = ['mise_disposition_request'];
const MAX_LEN = 200_000;

describe('filterValidImportItems', () => {
  it('accepts a known template with valid HTML and the required {{SIGNER_URL}}', () => {
    const { valid, skipped } = filterValidImportItems(
      [{ id: 'mise_disposition_request', html: '<html>{{SIGNER_URL}}</html>' }],
      KNOWN_IDS,
      SIGNER_REQUIRED,
      MAX_LEN,
    );
    expect(valid).toEqual([{ id: 'mise_disposition_request', html: '<html>{{SIGNER_URL}}</html>' }]);
    expect(skipped).toBe(0);
  });

  it('does not require {{SIGNER_URL}} for a non-signer template', () => {
    const { valid, skipped } = filterValidImportItems(
      [{ id: 'contestation_alert', html: '<html>{{REFERENCE}}</html>' }],
      KNOWN_IDS,
      SIGNER_REQUIRED,
      MAX_LEN,
    );
    expect(valid).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('skips an unknown template id', () => {
    const { valid, skipped } = filterValidImportItems(
      [{ id: 'unknown_template', html: '<html>x</html>' }],
      KNOWN_IDS,
      SIGNER_REQUIRED,
      MAX_LEN,
    );
    expect(valid).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('skips an empty (whitespace-only) HTML', () => {
    const { valid, skipped } = filterValidImportItems(
      [{ id: 'confirmation_restitution', html: '   ' }],
      KNOWN_IDS,
      SIGNER_REQUIRED,
      MAX_LEN,
    );
    expect(valid).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('skips HTML exceeding the maximum length', () => {
    const { valid, skipped } = filterValidImportItems(
      [{ id: 'confirmation_restitution', html: 'a'.repeat(10) }],
      KNOWN_IDS,
      SIGNER_REQUIRED,
      5,
    );
    expect(valid).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('skips a signer-required template missing {{SIGNER_URL}}', () => {
    const { valid, skipped } = filterValidImportItems(
      [{ id: 'mise_disposition_request', html: '<html>{{REFERENCE}}</html>' }],
      KNOWN_IDS,
      SIGNER_REQUIRED,
      MAX_LEN,
    );
    expect(valid).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('skips a null html on a signer-required template without throwing (htmlOk checked before signerOk)', () => {
    const items = [{ id: 'mise_disposition_request', html: null as unknown as string }];
    expect(() => filterValidImportItems(items, KNOWN_IDS, SIGNER_REQUIRED, MAX_LEN)).not.toThrow();
    expect(filterValidImportItems(items, KNOWN_IDS, SIGNER_REQUIRED, MAX_LEN)).toEqual({
      valid: [],
      skipped: 1,
    });
  });

  it('processes a mixed batch, counting valid and skipped independently', () => {
    const { valid, skipped } = filterValidImportItems(
      [
        { id: 'contestation_alert', html: '<html>ok</html>' },
        { id: 'unknown', html: '<html>ok</html>' },
        { id: 'confirmation_restitution', html: '   ' },
        { id: 'mise_disposition_request', html: '<html>{{REFERENCE}}</html>' },
        { id: 'mise_disposition_request', html: '<html>{{SIGNER_URL}}</html>' },
      ],
      KNOWN_IDS,
      SIGNER_REQUIRED,
      MAX_LEN,
    );
    expect(valid).toHaveLength(2);
    expect(skipped).toBe(3);
  });
});
