// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for OnboardingPage.
 *
 * Covers accessibility-first setup, the local-only/account split, and the
 * starter budget template step.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NavigateOptions, To } from 'react-router-dom';

import { App, shouldAutoLaunchOnboarding } from '../App';
import OnboardingPage from './OnboardingPage';
import { useAuth } from '../auth/auth-context';
import { useBudgets } from '../hooks/useBudgets';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import { useLocalOnlyMode } from '../hooks/useLocalOnlyMode';

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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
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
  createBudgetTemplate: vi.fn(() => null),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  reorderBudgets: vi.fn(),
  getBudgetSpendingBreakdown: vi.fn(() => []),
};

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
});

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const skipComfortStep = () => {
  fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
};

const continuePastComfortStep = () => {
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
};

const continueToTemplateStep = () => {
  continuePastComfortStep();
  fireEvent.click(screen.getByRole('button', { name: /start local only/i }));
  fireEvent.click(screen.getByRole('button', { name: /essential only/i }));
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

  it('stores Huge text preferences from the comfort step', () => {
    renderWithRouter(<OnboardingPage />);

    const textSizeSlider = screen.getByRole('slider', { name: /text size/i });
    expect(textSizeSlider).toHaveAttribute('max', '4');

    fireEvent.change(textSizeSlider, { target: { value: '4' } });

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
      'Step 1 of 5: Comfort preferences. Current step.',
    );

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('status', { name: /onboarding progress/i })).toHaveTextContent(
      'Step 2 of 5: Choose setup path. Current step.',
    );
  });

  it('stores comfort preferences and lets the user skip ahead', () => {
    renderWithRouter(<OnboardingPage />);

    fireEvent.change(screen.getByRole('slider', { name: /text size/i }), {
      target: { value: '2' },
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

  it('starts at the education/template step for an authenticated (post-signup) visitor', () => {
    mockedUseAuth.mockReturnValue(authenticatedAuthReturn);

    renderWithRouter(<OnboardingPage />);

    // Skips the pre-signup welcome (comfort/choose) and lands on the deferred
    // education/template step.
    expect(
      screen.getByRole('heading', { name: /want a starter budget\? choose a template:/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use student template/i })).toBeInTheDocument();
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

  it('shows the starter budget template step after privacy selection', () => {
    renderWithRouter(<OnboardingPage />);

    continuePastComfortStep();
    fireEvent.click(screen.getByRole('button', { name: /start local only/i }));
    fireEvent.click(screen.getByRole('button', { name: /essential only/i }));

    expect(
      screen.getByRole('heading', { name: /want a starter budget\? choose a template:/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use student template/i })).toBeInTheDocument();
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

    continueToTemplateStep();
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

    continueToTemplateStep();
    fireEvent.click(screen.getByRole('button', { name: /what is cash flow/i }));

    expect(screen.getByRole('dialog', { name: /cash flow/i })).toBeInTheDocument();
    expect(screen.getByText(/timing of money coming in and going out/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close explainer/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('completes financial-literacy lessons and reflects progress in the checklist', () => {
    renderWithRouter(<OnboardingPage />);

    continueToTemplateStep();
    fireEvent.click(screen.getByRole('button', { name: /concert ticket/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep a small buffer/i }));
    fireEvent.click(screen.getByRole('button', { name: /monthly phone bill/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(localStorage.getItem('finance-onboarding-completed-lessons')).toContain('needs-wants');
    expect(screen.getByText(/education lessons 3\/3 complete/i)).toBeInTheDocument();
  });

  it('previews and saves an onboarding goal before checklist completion', () => {
    renderWithRouter(<OnboardingPage />);

    continueToTemplateStep();
    fireEvent.change(screen.getByLabelText(/goal name/i), { target: { value: 'Move fund' } });
    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText(/starting balance/i), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /preview goal/i }));

    expect(screen.getByText(/confirm goal before saving/i)).toBeInTheDocument();
    expect(screen.getByText(/estimated monthly contribution: \$1000/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save goal/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(localStorage.getItem('finance-onboarding-goals')).toContain('Move fund');
    expect(screen.getByText(/1 goal saved/i)).toBeInTheDocument();
  });

  it('lets users hide, restore, dismiss, and reopen post-onboarding setup help', () => {
    renderWithRouter(<OnboardingPage />);

    continueToTemplateStep();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(
      screen.getByRole('region', { name: /fully set-up progress checklist/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /first-run coach marks/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hide checklist/i }));

    expect(localStorage.getItem('finance-onboarding-checklist-hidden')).toBe('true');
    expect(screen.getByText(/fully set-up checklist hidden/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restore setup checklist/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss all coach marks/i }));

    expect(localStorage.getItem('finance-onboarding-coach-marks-dismissed')).toBe('true');
    expect(screen.getByRole('button', { name: /reopen coach marks/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reopen coach marks/i }));

    expect(localStorage.getItem('finance-onboarding-coach-marks-dismissed')).toBe('false');
    expect(screen.getByText(/budget categories are planning buckets/i)).toBeInTheDocument();
  });

  it('creates the student starter budget before completing onboarding', () => {
    const enableLocalOnly = vi.fn();
    const completeOnboarding = vi.fn();
    const rejectAll = vi.fn();
    const createBudgetTemplate = vi.fn(() => [
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
    fireEvent.click(screen.getByRole('button', { name: /use student template/i }));

    expect(rejectAll).toHaveBeenCalled();
    expect(enableLocalOnly).toHaveBeenCalled();
    expect(createBudgetTemplate).toHaveBeenCalledWith({
      templateId: 'student',
      startDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),
    });
    expect(completeOnboarding).toHaveBeenCalled();
    expect(screen.getByText(/student starter budget is already in place/i)).toBeInTheDocument();
  });

  it('surfaces an optional, private newcomer tax-ID and income-type step', () => {
    renderWithRouter(<OnboardingPage />);

    continueToTemplateStep();

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

    continueToTemplateStep();

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

    fireEvent.click(screen.getByRole('button', { name: /close explainer/i }));

    expect(
      screen.queryByRole('dialog', { name: /individual taxpayer identification number/i }),
    ).not.toBeInTheDocument();
  });

  it('surfaces the 401(k) explainer for W-2 workers with an SSN', () => {
    renderWithRouter(<OnboardingPage />);

    continueToTemplateStep();

    fireEvent.click(screen.getByRole('radio', { name: /i have an ssn/i }));
    fireEvent.click(screen.getByRole('radio', { name: /w-2 job/i }));

    expect(screen.getByRole('button', { name: /what is a 401\(k\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /using an itin/i })).not.toBeInTheDocument();
  });
});
