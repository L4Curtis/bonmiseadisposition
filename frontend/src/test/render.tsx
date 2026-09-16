import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial URL for the MemoryRouter (defaults to '/'). */
  route?: string;
  /** Route path pattern to match `route` against, e.g. '/signer/:token' —
   *  required whenever the component under test reads params via
   *  useParams() (useNavigate/useSearchParams work without it). */
  path?: string;
}

/**
 * Reusable render helper for page/component tests: wraps `ui` in a
 * MemoryRouter (with an optional parametrized Route so useParams() resolves)
 * and returns a ready-to-use userEvent instance alongside the usual Testing
 * Library render result.
 *
 * Network calls (the `api` module, or raw `global.fetch`) are deliberately
 * NOT mocked here: the expected responses differ per test scenario, so each
 * test mocks them directly (vi.mock('@/lib/api') / global.fetch = vi.fn()).
 *
 * Note: none of the pages currently covered by this test suite (SignaturePage,
 * PortailCollaborateur, Login, BonCreate) read `useAuth()` from
 * '@/contexts/AuthContext' — they each manage their own session check via
 * direct fetch calls — so this helper does not wrap children in an
 * AuthContext provider. A future test that needs to control `useAuth()`
 * should mock the module directly: vi.mock('@/contexts/AuthContext', () => ({
 * useAuth: () => ({ user, loading: false, refetch: vi.fn(), logout: vi.fn() }) })).
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path, ...options }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        {path ? (
          <Routes>
            <Route path={path} element={children} />
          </Routes>
        ) : (
          children
        )}
      </MemoryRouter>
    );
  }

  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
