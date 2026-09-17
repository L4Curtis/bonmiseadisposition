import { describe, it, expect } from 'vitest';
import { isSafeReturnTo } from '../safeReturnTo';

describe('isSafeReturnTo', () => {
  it('accepts a same-origin absolute path', () => {
    expect(isSafeReturnTo('/signer/tok-1')).toBe(true);
  });

  it('rejects a protocol-relative payload that resolves to another host', () => {
    expect(isSafeReturnTo('//evil.com')).toBe(false);
  });

  it('rejects a backslash payload normalized by the browser to another host', () => {
    expect(isSafeReturnTo('/\\evil.com')).toBe(false);
  });

  it('rejects an absolute URL to another origin', () => {
    expect(isSafeReturnTo('https://evil.com/phish')).toBe(false);
  });

  it('rejects a value that does not start with a slash', () => {
    expect(isSafeReturnTo('signer/tok-1')).toBe(false);
  });
});
