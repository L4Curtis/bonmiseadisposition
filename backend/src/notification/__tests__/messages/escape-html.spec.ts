import { escapeHtml } from '../../messages/escape-html';

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes &', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes double and single quotes', () => {
    expect(escapeHtml(`"a" 'b'`)).toBe('&quot;a&quot; &#039;b&#039;');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('leaves accented characters and safe text unchanged', () => {
    expect(escapeHtml('Péduzzi Électronique — Île-de-France')).toBe(
      'Péduzzi Électronique — Île-de-France',
    );
  });
});
