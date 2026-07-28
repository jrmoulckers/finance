// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { NavigationGuard } from './NavigationGuard';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../auth/auth-context', () => ({ useAuth: mockUseAuth }));

const EXIT_ANCHOR_KEY = '__financeExitAnchor';

function dispatchExitBack() {
  window.dispatchEvent(new PopStateEvent('popstate', { state: { [EXIT_ANCHOR_KEY]: true } }));
}

function renderGuard(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavigationGuard>
        <p>app</p>
      </NavigationGuard>
    </MemoryRouter>,
  );
}

describe('NavigationGuard back-from-onboarding (#3106)', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockNavigate.mockReset();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('routes an unauthenticated back-press into /login instead of prompting to leave', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    renderGuard('/onboarding');

    dispatchExitBack();

    expect(mockNavigate).toHaveBeenCalledWith('/login');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('routes an authenticated back-press into /dashboard instead of prompting to leave', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    renderGuard('/onboarding');

    dispatchExitBack();

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('does not prompt to leave on a genuine exit when there is nothing unsaved', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    renderGuard('/dashboard');

    dispatchExitBack();

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
