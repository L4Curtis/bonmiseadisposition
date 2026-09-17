import { renderTemplateHtml } from '../render';

describe('renderTemplateHtml', () => {
  it('replaces a single placeholder with the matching value', () => {
    expect(renderTemplateHtml('<p>{{NAME}}</p>', { NAME: 'Jean' })).toBe('<p>Jean</p>');
  });

  it('replaces every occurrence of a repeated placeholder', () => {
    expect(renderTemplateHtml('{{X}} and {{X}}', { X: 'a' })).toBe('a and a');
  });

  it('replaces multiple distinct placeholders', () => {
    expect(renderTemplateHtml('{{A}}-{{B}}', { A: '1', B: '2' })).toBe('1-2');
  });

  it('replaces an unknown placeholder with an empty string (never left as {{X}})', () => {
    expect(renderTemplateHtml('<p>{{MISSING}}</p>', {})).toBe('<p></p>');
  });

  it('does not escape or alter values already containing HTML (interpolation only)', () => {
    // Escaping is the caller's responsibility (notification/messages/escape-html.ts);
    // renderTemplateHtml must not double-escape or strip anything.
    expect(renderTemplateHtml('<div>{{CONTENT}}</div>', { CONTENT: '&lt;b&gt;X&lt;/b&gt;' })).toBe(
      '<div>&lt;b&gt;X&lt;/b&gt;</div>',
    );
  });

  it('leaves text without placeholders unchanged', () => {
    expect(renderTemplateHtml('<p>no vars here</p>', { NAME: 'Jean' })).toBe('<p>no vars here</p>');
  });

  it('only matches the {{WORD}} pattern (word characters), ignoring other double braces', () => {
    expect(renderTemplateHtml('{{ NAME }}', { NAME: 'Jean' })).toBe('{{ NAME }}');
  });
});
