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

const mockedUseLocalOnlyMode = vi.mocked(useLocalOnlyMode);
const mockedUseConsent = vi.mocked(useConsent);
const mockedUseConsentHistory = vi.mocked(useConsentHistory);
const mockedUseBudgets = vi.mocked(useBudgets);

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

  it('navigates to signup when Create Account is clicked', () => {
    renderWithRouter(<OnboardingPage />);
    skipComfortStep();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/signup');
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
});
