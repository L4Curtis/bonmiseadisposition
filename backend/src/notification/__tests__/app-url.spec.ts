import { resolveAppUrl } from '../app-url';

describe('resolveAppUrl', () => {
  it('uses the configured general.app_url when present', () => {
    expect(resolveAppUrl('https://app.example.com', {})).toBe('https://app.example.com');
  });

  it('strips a trailing slash from the configured value', () => {
    expect(resolveAppUrl('https://app.example.com/', {})).toBe('https://app.example.com');
  });

  it('strips multiple trailing slashes', () => {
    expect(resolveAppUrl('https://app.example.com///', {})).toBe('https://app.example.com');
  });

  it('falls back to FRONTEND_URL when general.app_url is missing', () => {
    expect(resolveAppUrl(null, { FRONTEND_URL: 'https://env.example.com' })).toBe(
      'https://env.example.com',
    );
  });

  it('strips a trailing slash from the FRONTEND_URL fallback', () => {
    expect(resolveAppUrl(null, { FRONTEND_URL: 'https://env.example.com/' })).toBe(
      'https://env.example.com',
    );
  });

  it('prefers the configured value over FRONTEND_URL when both are present', () => {
    expect(
      resolveAppUrl('https://configured.example.com', { FRONTEND_URL: 'https://env.example.com' }),
    ).toBe('https://configured.example.com');
  });

  it('returns an empty string in production when neither is configured', () => {
    expect(resolveAppUrl(null, { NODE_ENV: 'production' })).toBe('');
  });

  it('returns an empty string in production when configValue is an empty string', () => {
    expect(resolveAppUrl('', { NODE_ENV: 'production' })).toBe('');
  });

  it('defaults to http://localhost:5173 outside production when neither is configured', () => {
    expect(resolveAppUrl(null, {})).toBe('http://localhost:5173');
    expect(resolveAppUrl(null, { NODE_ENV: 'development' })).toBe('http://localhost:5173');
  });
});
