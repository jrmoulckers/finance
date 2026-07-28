// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for OnboardingPage.
 *
 * Covers accessibility-first setup, the local-only/account split, and the
 * starter budget template step.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { NavigateOptions, To } from 'react-router';

import { App, shouldAutoLaunchOnboarding } from '../App';
import OnboardingPage from './OnboardingPage';
import { useAuth } from '../auth/auth-context';
import { useBudgets } from '../hooks/useBudgets';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import { FONT_SCALE_OPTIONS } from '../hooks/useFontScale';
import { useLocalOnlyMode } from '../hooks/useLocalOnlyMode';
import { useGoals } from '../hooks/useGoals';
import { useDatabase } from '../db/DatabaseProvider';
import { getPrimaryHouseholdId } from '../db/repositories/household';

const createMatchMedia = (matches: boolean = false) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
vi.stubGlobal('matchMedia', createMatchMedia());

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate();
      return (to: To | number, options?: NavigateOptions) => {
        if (options === undefined) {
          mockNavigate(to);
        } else {
          mockNavigate(to, options);
        }

        if (typeof to === 'number') {
          return navigate(to);
        }

        return navigate(to, options);
      };
    },
  };
});

vi.mock('../hooks/useLocalOnlyMode', () => ({
  useLocalOnlyMode: vi.fn(),
}));

vi.mock('../hooks/useConsent', () => ({
  useConsent: vi.fn(),
}));

vi.mock('../hooks/useConsentHistory', () => ({
  useConsentHistory: vi.fn(),
}));

vi.mock('../hooks/useBudgets', () => ({
  useBudgets: vi.fn(),
}));

vi.mock('../hooks/useGoals', () => ({
  useGoals: vi.fn(),
}));

vi.mock('../db/DatabaseProvider', async () => {
  const actual =
    await vi.importActual<typeof import('../db/DatabaseProvider')>('../db/DatabaseProvider');
  return {
    ...actual,
    useDatabase: vi.fn(() => ({})),
  };
});

vi.mock('../db/repositories/household', async () => {
  const actual = await vi.importActual<typeof import('../db/repositories/household')>(
    '../db/repositories/household',
  );
  return {
    ...actual,
    getPrimaryHouseholdId: vi.fn(() => 'household-1'),
  };
});

// Partial mock: keep the real AuthProvider/ProtectedRoute exports (used by App/routes)
// and only stub useAuth so OnboardingPage can be rendered without an AuthProvider and
// the post-signup (authenticated) start step can be exercised (#3089).
vi.mock('../auth/auth-context', async () => {
  const actual =
    await vi.importActual<typeof import('../auth/auth-context')>('../auth/auth-context');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

const mockedUseLocalOnlyMode = vi.mocked(useLocalOnlyMode);
const mockedUseConsent = vi.mocked(useConsent);
const mockedUseConsentHistory = vi.mocked(useConsentHistory);
const mockedUseBudgets = vi.mocked(useBudgets);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseGoals = vi.mocked(useGoals);
const mockedUseDatabase = vi.mocked(useDatabase);
const mockedGetPrimaryHouseholdId = vi.mocked(getPrimaryHouseholdId);

const unauthenticatedAuthReturn = {
  isAuthenticated: false,
  isLoading: false,
} as unknown as ReturnType<typeof useAuth>;

const authenticatedAuthReturn = {
  isAuthenticated: true,
  isLoading: false,
} as unknown as ReturnType<typeof useAuth>;

const defaultLocalOnlyReturn = {
  isLocalOnly: false,
  onboardingComplete: false,
  features: [
    {
      id: 'accounts',
      name: 'Account Tracking',
      description: 'Track bank accounts.',
      availableLocalOnly: true,
      requiresAccount: false,
    },
    {
      id: 'sync',
      name: 'Cloud Sync',
      description: 'Sync across devices.',
      availableLocalOnly: false,
      requiresAccount: true,
    },
  ],
  enableLocalOnly: vi.fn(),
  disableLocalOnly: vi.fn(),
  completeOnboarding: vi.fn(),
  isFeatureAvailable: vi.fn(() => true),
  refresh: vi.fn(),
};

const defaultConsentReturn = {
  consent: {
    categories: {
      essential: true,
      analytics: false,
      error_reporting: false,
      sync: false,
      marketing: false,
    },
    timestamp: '',
    policyVersion: '1.0.0',
    method: 'first_run' as const,
    hasCompletedFirstRun: false,
  },
  needsConsent: true,
  hasCompleted: false,
  updateCategory: vi.fn(),
  acceptAll: vi.fn(),
  rejectAll: vi.fn(),
  savePreferences: vi.fn(),
  refresh: vi.fn(),
};

const defaultConsentHistoryReturn = {
  history: [],
  loading: false,
  recordChange: vi.fn(),
  recordBulkChanges: vi.fn(),
  exportHistory: vi.fn(),
  clearHistory: vi.fn(),
  refresh: vi.fn(),
};

const defaultBudgetsReturn = {
  budgets: [],
  loading: false,
  error: null,
  refresh: vi.fn(),
  createBudget: vi.fn(),
  createBudgetTemplate: vi.fn().mockResolvedValue(null),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  reorderBudgets: vi.fn(),
  getBudgetSpendingBreakdown: vi.fn().mockResolvedValue([]),
};

const createGoalMock = vi.fn(() => ({ id: 'goal-1' }));

const defaultGoalsReturn = {
  goals: [],
  loading: false,
  error: null,
  refresh: vi.fn(),
  createGoal: createGoalMock,
  updateGoal: vi.fn(),
  contributeToGoal: vi.fn(),
  deleteGoal: vi.fn(),
  reorderGoals: vi.fn(),
} as unknown as ReturnType<typeof useGoals>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', createMatchMedia(false));
  localStorage.clear();
  document.documentElement.style.fontSize = '';
  document.documentElement.style.removeProperty('--finance-font-scale');
  document.documentElement.removeAttribute('data-font-scale');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-reduced-motion');
  document.documentElement.removeAttribute('data-a11y-cognitive');
  mockedUseLocalOnlyMode.mockReturnValue(defaultLocalOnlyReturn);
  mockedUseConsent.mockReturnValue(defaultConsentReturn);
  mockedUseConsentHistory.mockReturnValue(defaultConsentHistoryReturn);
  mockedUseBudgets.mockReturnValue(defaultBudgetsReturn);
  mockedUseAuth.mockReturnValue(unauthenticatedAuthReturn);
  mockedUseGoals.mockReturnValue(defaultGoalsReturn);
  mockedUseDatabase.mockReturnValue({} as unknown as ReturnType<typeof useDatabase>);
  mockedGetPrimaryHouseholdId.mockReturnValue(
    'household-1' as unknown as ReturnType<typeof getPrimaryHouseholdId>,
  );
});

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const skipComfortStep = () => {
  fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
};

const continuePastComfortStep = () => {
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
};

const goToNewcomerStep = () => {
  continuePastComfortStep();
  fireEvent.click(screen.getByRole('button', { name: /start local only/i }));
  fireEvent.click(screen.getByRole('button', { name: /essential only/i }));
};

const goToGoalsStep = () => {
  goToNewcomerStep();
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
};

const goToTemplateStep = () => {
  goToGoalsStep();
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
};

describe('OnboardingPage', () => {
  it('renders the comfort settings step first', () => {
    renderWithRouter(<OnboardingPage />);

    expect(screen.getByRole('heading', { name: /welcome to finance/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /make it yours/i })).toBeInTheDocument();
    const simpleModeButton = screen.getByRole('button', { name: /use simple mode/i });
    const textSizeSlider = screen.getByRole('slider', { name: /text size/i });

    expect(simpleModeButton).toBeInTheDocument();
    expect(textSizeSlider).toBeInTheDocument();
    expect(
      simpleModeButton.compareDocumentPosition(textSizeSlider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /reduce motion/i })).toBeInTheDocument();
    expect(screen.getByText('Huge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
  });

  it('auto-launches onboarding for first-run app visits', async () => {
    mockedUseConsent.mockReturnValue({
      ...defaultConsentReturn,
      needsConsent: false,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /make it yours/i })).toBeInTheDocument();
    expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument();
  });

  it('does not auto-launch onboarding after completion or while already onboarding', () => {
    expect(shouldAutoLaunchOnboarding('/dashboard', true)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/onboarding', false)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/dashboard', false)).toBe(true);
  });

  it('lets a first-run visitor reach the auth pages so signup precedes onboarding', () => {
    // /login and /signup are exempt so the account path can defer onboarding until
    // after signup; only after authenticating and leaving these pages does the app
    // resume onboarding (#3089).
    expect(shouldAutoLaunchOnboarding('/signup', false)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/login', false)).toBe(false);
  });

  it('lets a first-run visitor reach the legal pages linked from the auth footers (#3110)', () => {
    // Legal/Privacy/Terms/CCPA links must be reachable pre-onboarding for compliance;
    // bouncing visitors to /onboarding would hide them. Prefix match covers the docs.
    expect(shouldAutoLaunchOnboarding('/legal', false)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/legal/privacy', false)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/legal/terms', false)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/legal/ccpa', false)).toBe(false);
  });

  it('lets a first-run visitor reach the bare legal aliases linked from the consent modal (#3119)', () => {
    // The GDPR consent modal links to /privacy directly; that alias and its
    // siblings must be exempt so the privacy notice is reachable pre-onboarding.
    expect(shouldAutoLaunchOnboarding('/privacy', false)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/terms', false)).toBe(false);
    expect(shouldAutoLaunchOnboarding('/ccpa', false)).toBe(false);
  });

  it('stores Huge text preferences from the comfort step', () => {
    renderWithRouter(<OnboardingPage />);

    const textSizeSlider = screen.getByRole('slider', { name: /text size/i });
    expect(textSizeSlider).toHaveAttribute('max', '7');

    fireEvent.change(textSizeSlider, { target: { value: '7' } });

    expect(localStorage.getItem('finance-font-scale-preference')).toBe('huge');
    expect(document.documentElement.style.fontSize).toBe('200%');
    expect(document.documentElement.style.getPropertyValue('--finance-font-scale')).toBe('2');
  });

  it('applies Simple Mode in one tap before financial setup', () => {
    renderWithRouter(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: /use simple mode/i }));

    expect(localStorage.getItem('finance-font-scale-preference')).toBe('large');
    expect(localStorage.getItem('finance-reduced-motion-preference')).toBe('true');
    expect(localStorage.getItem('finance-simplified-mode')).toBe('true');
    expect(document.documentElement.style.fontSize).toBe('125%');
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
    expect(document.documentElement.getAttribute('data-a11y-cognitive')).toBe('true');
    expect(screen.getByRole('heading', { name: /local only/i })).toBeInTheDocument();
  });

  it('announces onboarding progress as steps change', () => {
    renderWithRouter(<OnboardingPage />);

    expect(screen.getByRole('status', { name: /onboarding progress/i })).toHaveTextContent(
      'Step 1 of 7: Comfort preferences. Current step.',
    );

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('status', { name: /onboarding progress/i })).toHaveTextContent(
      'Step 2 of 7: Choose setup path. Current step.',
    );

    fireEvent.click(screen.getByRole('button', { name: /start local only/i }));
    fireEvent.click(screen.getByRole('button', { name: /essential only/i }));

    expect(screen.getByRole('status', { name: /onboarding progress/i })).toHaveTextContent(
      'Step 4 of 7: Personalize your setup. Current step.',
    );

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(screen.getByRole('status', { name: /onboarding progress/i })).toHaveTextContent(
      'Step 5 of 7: Set a savings goal. Current step.',
    );
  });

  it('shows a visible step-progress indicator on each wizard step', () => {
    renderWithRouter(<OnboardingPage />);

    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();

    goToNewcomerStep();

    expect(screen.getByText('Step 4 of 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /personalize your setup/i })).toBeInTheDocument();
  });

  it('stores comfort preferences and lets the user skip ahead', () => {
    renderWithRouter(<OnboardingPage />);

    fireEvent.change(screen.getByRole('slider', { name: /text size/i }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /reduce motion/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /simplified mode/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /high contrast/i }));

    expect(localStorage.getItem('finance-font-scale-preference')).toBe('large');
    expect(localStorage.getItem('finance-reduced-motion-preference')).toBe('true');
    expect(localStorage.getItem('finance-simplified-mode')).toBe('true');
    expect(localStorage.getItem('finance-theme-preference')).toBe('high-contrast');
    expect(document.documentElement.style.fontSize).toBe('125%');
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
    expect(document.documentElement.getAttribute('data-a11y-cognitive')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');

    skipComfortStep();

    expect(screen.getByRole('heading', { name: /local only/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
  });

  it('hydrates comfort toggles from persisted preferences on mount (#3891)', () => {
    // Persisted comfort settings are applied on boot but the onboarding controls
    // previously ignored them, rendering OFF while the effect stayed applied.
    localStorage.setItem('finance-theme-preference', 'high-contrast');
    localStorage.setItem('finance-reduced-motion-preference', 'true');
    localStorage.setItem('finance-simplified-mode', 'true');
    localStorage.setItem('finance-font-scale-preference', 'large');

    renderWithRouter(<OnboardingPage />);

    expect(screen.getByRole('checkbox', { name: /high contrast/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /reduce motion/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /simplified mode/i })).toBeChecked();
    // Derive the expected slider index dynamically so the assertion stays
    // robust if the font-scale option set changes (#3886/#3891).
    const largeIndex = String(FONT_SCALE_OPTIONS.findIndex((o) => o.value === 'large'));
    expect(screen.getByRole('slider', { name: /text size/i })).toHaveValue(largeIndex);
  });

  it('leaves comfort toggles OFF when nothing is persisted (#3891)', () => {
    renderWithRouter(<OnboardingPage />);

    expect(screen.getByRole('checkbox', { name: /high contrast/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /reduce motion/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /simplified mode/i })).not.toBeChecked();
    // Defaults to the stored/default preference index, derived dynamically.
    const defaultIndex = String(FONT_SCALE_OPTIONS.findIndex((o) => o.value === 'default'));
    expect(screen.getByRole('slider', { name: /text size/i })).toHaveValue(defaultIndex);
  });

  it('navigates to signup without completing onboarding when Create Account is clicked', () => {
    const completeOnboarding = vi.fn();
    mockedUseLocalOnlyMode.mockReturnValue({
      ...defaultLocalOnlyReturn,
      completeOnboarding,
    });

    renderWithRouter(<OnboardingPage />);
    skipComfortStep();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/signup');
    // Onboarding stays incomplete so the education/template content runs AFTER
    // signup, when the app re-launches onboarding for the authenticated user (#3089).
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('starts at the deferred setup wizard for an authenticated (post-signup) visitor', () => {
    mockedUseAuth.mockReturnValue(authenticatedAuthReturn);

    renderWithRouter(<OnboardingPage />);

    // Skips the pre-signup welcome (comfort/choose) and lands on the first deferred
    // setup step (#3089, #3118).
    expect(screen.getByRole('heading', { name: /personalize your setup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /welcome to finance/i })).not.toBeInTheDocument();
  });

  it('shows privacy preferences step when Local Only is clicked', () => {
    renderWithRouter(<OnboardingPage />);
    continuePastComfortStep();

    fireEvent.click(screen.getByRole('button', { name: /start local only/i }));

    expect(screen.getByRole('heading', { name: /privacy preferences/i })).toBeInTheDocument();
  });

  it('renders feature comparison table after the comfort step', () => {
    renderWithRouter(<OnboardingPage />);
    skipComfortStep();

    expect(screen.getByText('Account Tracking')).toBeInTheDocument();
    expect(screen.getByText('Cloud Sync')).toBeInTheDocument();
  });

  it('shows the starter budget template step after the deferred setup wizard', () => {
    renderWithRouter(<OnboardingPage />);

    continuePastComfortStep();
    fireEvent.click(screen.getByRole('button', { name: /start local only/i }));
    fireEvent.click(screen.getByRole('button', { name: /essential only/i }));
    // newcomer -> goals -> template
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(
      screen.getByRole('heading', { name: /want a starter budget\? choose a template:/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create my budget/i })).toBeInTheDocument();
    expect(screen.getByText(/adjust these based on your income/i)).toBeInTheDocument();
  });

  it('persists life-stage selections and updates tailored guidance with analytics opt-in', () => {
    mockedUseConsent.mockReturnValue({
      ...defaultConsentReturn,
      consent: {
        ...defaultConsentReturn.consent,
        categories: {
          ...defaultConsentReturn.consent.categories,
          analytics: true,
        },
      },
    });

    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();
    fireEvent.click(screen.getByLabelText(/freelancer/i));
    fireEvent.click(screen.getByLabelText(/caregiver/i));

    expect(localStorage.getItem('finance-onboarding-life-stages')).toContain('freelancer');
    expect(localStorage.getItem('finance-onboarding-life-stages')).toContain('caregiver');
    expect(screen.getByText(/estimate conservative income/i)).toBeInTheDocument();
    expect(screen.getByText(/create a notes-first estimate/i)).toBeInTheDocument();
    expect(localStorage.getItem('finance-onboarding-analytics-events')).toContain(
      'onboarding_life_stage_updated',
    );
  });

  it('shows glossary explainers from onboarding coach copy', () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();
    fireEvent.click(screen.getByRole('button', { name: /what is cash flow/i }));

    expect(screen.getByRole('dialog', { name: /cash flow/i })).toBeInTheDocument();
    expect(screen.getByText(/timing of money coming in and going out/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /got it/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('traps focus within the glossary dialog while it is open', () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();
    fireEvent.click(screen.getByRole('button', { name: /what is cash flow/i }));

    const dialog = screen.getByRole('dialog', { name: /cash flow/i });
    // Focus is moved into the dialog on open.
    expect(dialog.contains(document.activeElement)).toBe(true);

    const focusable = within(dialog).getAllByRole('button');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Tab from the last focusable wraps to the first (forward trap).
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first focusable wraps to the last (backward trap).
    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('completes financial-literacy lessons and reflects progress in the checklist', async () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();
    fireEvent.click(screen.getByRole('button', { name: /yes, show me lessons/i }));
    fireEvent.click(screen.getByRole('button', { name: /concert ticket/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep a small buffer/i }));
    fireEvent.click(screen.getByRole('button', { name: /monthly phone bill/i }));

    expect(localStorage.getItem('finance-onboarding-completed-lessons')).toContain('needs-wants');

    // Lessons live on the newcomer step now; advance through goals + template and
    // skip the starter budget to reach the completion checklist (#3118).
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    // Reaching the checklist runs the async "skip" handler (goal migration +
    // onboarding completion), so wait for the completion step to render (#3118).
    expect(await screen.findByText(/education lessons 3\/3 complete/i)).toBeInTheDocument();
  });

  it('keeps financial-literacy lessons opt-in and not required to proceed', () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();

    // Lessons are gated behind an explicit opt-in, so the answer choices are hidden.
    expect(screen.getByRole('button', { name: /yes, show me lessons/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /concert ticket/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /yes, show me lessons/i }));

    expect(screen.getByRole('button', { name: /concert ticket/i })).toBeInTheDocument();
  });

  it('resets the goal form and confirms the save', () => {
    renderWithRouter(<OnboardingPage />);

    goToGoalsStep();
    const goalNameInput = screen.getByLabelText(/goal name/i) as HTMLInputElement;
    fireEvent.change(goalNameInput, { target: { value: 'Move fund' } });
    fireEvent.click(screen.getByRole('button', { name: /preview goal/i }));
    fireEvent.click(screen.getByRole('button', { name: /save goal/i }));

    // The form clears for the next goal and a confirmation is announced.
    expect(goalNameInput.value).toBe('Emergency buffer');
    expect(screen.getByText(/is in your plan/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /saved goals/i })).toBeInTheDocument();
  });

  it('dismisses an explainer dialog with the top-right close control', () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();
    fireEvent.click(screen.getByRole('button', { name: /what is cash flow/i }));

    const dialog = screen.getByRole('dialog', { name: /cash flow/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /^close$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deep-links the checklist "Edit guidance" link to the life-stage section', async () => {
    renderWithRouter(<OnboardingPage />);

    goToTemplateStep();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    // The checklist "Edit guidance" link only exists after the async skip handler
    // completes onboarding and renders the completion step, so wait for it.
    fireEvent.click(await screen.findByRole('button', { name: /edit guidance/i }));

    expect(screen.getByRole('heading', { name: /personalize your setup/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.getElementById('onboarding-life-stage-guidance')).toHaveFocus(),
    );
  });

  it('deep-links the checklist "Review lessons" link to the lessons section', async () => {
    renderWithRouter(<OnboardingPage />);

    goToTemplateStep();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    // The checklist "Review lessons" link only exists after the async skip handler
    // completes onboarding and renders the completion step, so wait for it.
    fireEvent.click(await screen.findByRole('button', { name: /review lessons/i }));

    expect(screen.getByRole('heading', { name: /personalize your setup/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.getElementById('onboarding-financial-lessons')).toHaveFocus(),
    );
  });

  it('previews and saves an onboarding goal before checklist completion', async () => {
    renderWithRouter(<OnboardingPage />);

    goToGoalsStep();
    fireEvent.change(screen.getByLabelText(/goal name/i), { target: { value: 'Move fund' } });
    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText(/starting balance/i), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /preview goal/i }));

    expect(screen.getByText(/confirm goal before saving/i)).toBeInTheDocument();
    // #3408: onboarding money renders with locale thousands separators.
    expect(screen.getByText(/save \$1,200/i)).toBeInTheDocument();
    expect(screen.getByText(/estimated monthly contribution: \$1,000/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save goal/i }));
    // Advance goals -> template, then skip the starter budget to reach the checklist.
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    // #3405: the goal is migrated into the real goals store (minor units) and the
    // onboarding-only localStorage cache is cleared once persisted. Migration runs
    // in the async "skip" handler, so wait for the checklist before asserting.
    expect(await screen.findByText(/1 goal saved/i)).toBeInTheDocument();
    expect(createGoalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: 'household-1',
        name: 'Move fund',
        targetAmount: { amount: 120_000 },
        currentAmount: { amount: 20_000 },
      }),
    );
    expect(localStorage.getItem('finance-onboarding-goals')).toBe('[]');
  });

  it('migrates onboarding goals into the real goals store when creating the starter budget (#3405)', async () => {
    mockedUseBudgets.mockReturnValue({
      ...defaultBudgetsReturn,
      createBudgetTemplate: vi
        .fn()
        .mockResolvedValue([
          { id: 'budget-1', householdId: 'household-1' },
        ]) as unknown as typeof defaultBudgetsReturn.createBudgetTemplate,
    });

    renderWithRouter(<OnboardingPage />);

    goToGoalsStep();
    fireEvent.change(screen.getByLabelText(/goal name/i), { target: { value: 'Emergency fund' } });
    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/starting balance/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /preview goal/i }));
    fireEvent.click(screen.getByRole('button', { name: /save goal/i }));

    // goals -> template, then create the starter budget (the household now exists).
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /create my budget/i }));

    // Creating the starter budget triggers the async goal migration + onboarding
    // completion, so wait for the local cache to clear before asserting (#3405).
    // writeGoals([]) only runs after createGoal resolves, so a cleared cache also
    // guarantees the goal was migrated.
    await waitFor(() => expect(localStorage.getItem('finance-onboarding-goals')).toBe('[]'));
    expect(createGoalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: 'household-1',
        name: 'Emergency fund',
        targetAmount: { amount: 100_000 },
        currentAmount: { amount: 0 },
      }),
    );
  });

  it('keeps onboarding goals in local storage when no household exists yet (#3405)', () => {
    mockedGetPrimaryHouseholdId.mockReturnValue(
      null as unknown as ReturnType<typeof getPrimaryHouseholdId>,
    );

    renderWithRouter(<OnboardingPage />);

    goToGoalsStep();
    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /preview goal/i }));
    fireEvent.click(screen.getByRole('button', { name: /save goal/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    // The goal must not be silently dropped: with no household to attach it to,
    // it stays cached locally so a later completion can still migrate it.
    expect(createGoalMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('finance-onboarding-goals')).toContain('750');
  });

  it('blocks previewing a goal until a positive target amount is entered (#3410)', () => {
    renderWithRouter(<OnboardingPage />);

    goToGoalsStep();
    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '0' } });

    const previewButton = screen.getByRole('button', { name: /preview goal/i });
    expect(previewButton).toBeDisabled();
    expect(screen.getByText(/enter a target amount greater than \$0/i)).toBeInTheDocument();

    // Clicking the disabled control must not open the confirmation.
    fireEvent.click(previewButton);
    expect(screen.queryByText(/confirm goal before saving/i)).not.toBeInTheDocument();

    // A positive amount re-enables previewing and clears the hint.
    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '500' } });
    expect(screen.getByRole('button', { name: /preview goal/i })).toBeEnabled();
    expect(screen.queryByText(/enter a target amount greater than \$0/i)).not.toBeInTheDocument();
  });

  it('strips non-numeric characters from goal amount inputs (#3411)', () => {
    renderWithRouter(<OnboardingPage />);

    goToGoalsStep();
    const amountInput = screen.getByLabelText(/target amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1a2b3c' } });

    expect(amountInput.value).toBe('123');
  });

  it('lets users hide, restore, dismiss, and reopen post-onboarding setup help', async () => {
    renderWithRouter(<OnboardingPage />);

    goToTemplateStep();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    // The setup checklist renders after the async "skip" handler completes
    // onboarding, so wait for the completion step before interacting with it.
    expect(await screen.findByRole('region', { name: /setup progress/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /quick tips/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hide checklist/i }));

    expect(localStorage.getItem('finance-onboarding-checklist-hidden')).toBe('true');
    expect(screen.getByText(/checklist hidden/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show checklist/i }));
    fireEvent.click(screen.getByRole('button', { name: /hide tips/i }));

    expect(localStorage.getItem('finance-onboarding-coach-marks-dismissed')).toBe('true');
    expect(screen.getByRole('button', { name: /show tips/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show tips/i }));

    expect(localStorage.getItem('finance-onboarding-coach-marks-dismissed')).toBe('false');
    expect(screen.getByText(/budget categories are planning buckets/i)).toBeInTheDocument();
  });

  it('creates the student starter budget before completing onboarding', async () => {
    const enableLocalOnly = vi.fn();
    const completeOnboarding = vi.fn();
    const rejectAll = vi.fn();
    const createBudgetTemplate = vi.fn().mockResolvedValue([
      {
        id: 'budget-1',
        householdId: 'household-1',
        categoryId: 'category-food',
        name: 'Student essentials',
        amount: { amount: 50000 },
        currency: { code: 'USD', decimalPlaces: 2 },
        period: 'MONTHLY' as const,
        startDate: '2025-01-01',
        endDate: null,
        isRollover: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deletedAt: null,
        syncVersion: 1,
        isSynced: true,
      },
    ]);

    mockedUseLocalOnlyMode.mockReturnValue({
      ...defaultLocalOnlyReturn,
      enableLocalOnly,
      completeOnboarding,
    });

    mockedUseConsent.mockReturnValue({
      ...defaultConsentReturn,
      rejectAll,
    });

    mockedUseBudgets.mockReturnValue({
      ...defaultBudgetsReturn,
      createBudgetTemplate,
    });

    renderWithRouter(<OnboardingPage />);

    continuePastComfortStep();
    fireEvent.click(screen.getByRole('button', { name: /start local only/i }));
    fireEvent.click(screen.getByRole('button', { name: /essential only/i }));
    // newcomer -> goals -> template, where the starter budget CTA lives (#3118)
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /create my budget/i }));

    // The confirmation renders only after the async template creation + goal
    // migration completes onboarding (#3118), so wait for it before asserting.
    expect(
      await screen.findByText(/student starter budget is already in place/i),
    ).toBeInTheDocument();
    expect(rejectAll).toHaveBeenCalled();
    expect(enableLocalOnly).toHaveBeenCalled();
    expect(createBudgetTemplate).toHaveBeenCalledWith({
      templateId: 'student',
      startDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),
    });
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it('surfaces an optional, private newcomer tax-ID and income-type step', () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();

    expect(
      screen.getByRole('heading', { name: /new to working or taxes in the us\?/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/we never ask for any real id numbers/i)).toBeInTheDocument();

    expect(screen.getByRole('radiogroup', { name: /tax id status/i })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /income type/i })).toBeInTheDocument();

    // "Prefer not to say" is honored as a clearly skippable choice in both groups.
    expect(screen.getAllByRole('radio', { name: /prefer not to say/i })).toHaveLength(2);

    // Safe generic basics are visible before any selection is made.
    expect(screen.getByRole('button', { name: /what is a w-2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /what is a 1099/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /what is tax withholding/i })).toBeInTheDocument();
  });

  it('tailors explainers for ITIN holders and opens the ITIN explainer dialog', () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();

    fireEvent.click(screen.getByRole('radio', { name: /i use an itin/i }));
    fireEvent.click(screen.getByRole('radio', { name: /1099 or contract/i }));

    expect(localStorage.getItem('finance-onboarding-tax-id-status')).toBe('itin');
    expect(localStorage.getItem('finance-onboarding-income-type')).toBe('1099');
    expect(screen.getByText(/budget, save, and plan with an itin/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /using an itin/i }));

    expect(
      screen.getByRole('dialog', { name: /individual taxpayer identification number/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /why it matters/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /got it/i }));

    expect(
      screen.queryByRole('dialog', { name: /individual taxpayer identification number/i }),
    ).not.toBeInTheDocument();
  });

  it('surfaces the 401(k) explainer for W-2 workers with an SSN', () => {
    renderWithRouter(<OnboardingPage />);

    goToNewcomerStep();

    fireEvent.click(screen.getByRole('radio', { name: /i have an ssn/i }));
    fireEvent.click(screen.getByRole('radio', { name: /w-2 job/i }));

    expect(screen.getByRole('button', { name: /what is a 401\(k\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /using an itin/i })).not.toBeInTheDocument();
  });
});
