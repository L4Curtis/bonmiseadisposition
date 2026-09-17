import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UiViewProvider, useUiView, getAvailableViews } from '../UiViewContext';

let mockRole = 'direction';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      role: mockRole,
      displayName: 'Test User',
      email: 't@example.com',
      isItStaff: false,
      isLocalAccount: true,
      mustChangePassword: false,
      active: true,
      samAccountName: 'test',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

function Consumer() {
  const { activeView, availableViews } = useUiView();
  return (
    <div>
      <span data-testid="active-view">{activeView}</span>
      <span data-testid="available-views">{availableViews.join(',')}</span>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  mockRole = 'direction';
});

describe('UiViewContext', () => {
  it("getAvailableViews('direction') ne renvoie que la vue direction", () => {
    expect(getAvailableViews('direction')).toEqual(['direction']);
  });

  it("getAvailableViews reste inchangé pour admin et technician", () => {
    expect(getAvailableViews('admin')).toEqual(['collaborateur', 'technicien', 'administrateur']);
    expect(getAvailableViews('technician')).toEqual(['collaborateur', 'technicien']);
  });

  it('la vue par défaut est direction pour un compte direction sans préférence stockée', () => {
    render(
      <UiViewProvider>
        <Consumer />
      </UiViewProvider>,
    );
    expect(screen.getByTestId('active-view').textContent).toBe('direction');
    expect(screen.getByTestId('available-views').textContent).toBe('direction');
  });

  it('un localStorage "administrateur" pour un compte direction est clampé sur "direction"', () => {
    localStorage.setItem('uiView:prefs', JSON.stringify({ userId: 'u1', view: 'administrateur' }));

    render(
      <UiViewProvider>
        <Consumer />
      </UiViewProvider>,
    );

    expect(screen.getByTestId('active-view').textContent).toBe('direction');
  });
});
