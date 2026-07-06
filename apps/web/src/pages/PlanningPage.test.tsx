// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for PlanningPage — Financial planning tools hub.
 *
 * Mocks hooks (not repositories) following project testing conventions.
 *
 * References: #1743, #1735, #1721, #1679, #1644, #1635
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import {
  PlanningPage,
  buildReallocationGuidance,
  computeBudgetMonthlyFreeCashFlowCents,
  computeLifeEventProjections,
  sortLifeEvents,
} from './PlanningPage';
import {
  calculateRequiredMinimumDistribution,
  getUniformLifetimeDistributionPeriod,
  type RmdAccountStatus,
} from '../lib/rmd';
import {
  calculateIrmaaMonthlySurchargeCents,
  projectRetirementHealthcareCosts,
} from '../lib/planning';

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

const mockScenarioModeler = {
  scenarios: [],
  projections: [],
  selectedScenario: null,
  baseline: {
    netWorthCents: 10000000,
    monthlyIncomeCents: 500000,
    monthlyExpensesCents: 350000,
    savingsCents: 5000000,
  },
  projectionMonths: 60,
  loading: false,
  createScenario: vi.fn(),
  selectScenario: vi.fn(),
  deleteScenario: vi.fn(),
  duplicate: vi.fn(),
  addAdjustmentToSelected: vi.fn(),
  removeAdjustmentFromSelected: vi.fn(),
  updateScenarioName: vi.fn(),
  setProjectionMonths: vi.fn(),
};

const mockRetirementPlanner = {
  params: {
    currentAge: 30,
    retirementAge: 65,
    planningHorizonAge: 90,
    currentSavingsCents: 5000000,
    monthlyContributionCents: 100000,
    annualReturnRate: 0.07,
    annualInflationRate: 0.03,
    desiredMonthlySpendingCents: 400000,
    monthlyRetirementIncomeCents: 150000,
    annualReturnStdDev: 0.15,
  },
  readiness: {
    score: 72,
    rating: 'good' as const,
    monthlyGapCents: 25000,
    monteCarlo: {
      iterations: 1000,
      successRate: 0.74,
      medianFinalCents: 120000000,
      p10FinalCents: 30000000,
      p90FinalCents: 250000000,
      medianPath: [],
      p10Path: [],
      p90Path: [],
    },
    projectedSavingsCents: 180000000,
    targetNestEggCents: 150000000,
    factors: [
      { label: 'Savings on track', impact: 'positive' as const, description: 'Good progress.' },
    ],
  },
  incomeProjection: {
    points: [
      {
        age: 30,
        year: 0,
        phase: 'accumulation' as const,
        startingBalanceCents: 5000000,
        contributionCents: 1200000,
        targetSpendCents: 0,
        retirementIncomeCents: 0,
        withdrawalCents: 0,
        growthCents: 350000,
        endingBalanceCents: 6550000,
        depleted: false,
      },
      {
        age: 90,
        year: 60,
        phase: 'drawdown' as const,
        startingBalanceCents: 30000000,
        contributionCents: 0,
        targetSpendCents: 4800000,
        retirementIncomeCents: 1800000,
        withdrawalCents: 3000000,
        growthCents: 1200000,
        endingBalanceCents: 28200000,
        depleted: false,
      },
    ],
    depletionAge: null,
    lastsThroughHorizon: true,
    finalBalanceCents: 28200000,
    horizonAge: 90,
  },
  computing: false,
  setCurrentAge: vi.fn(),
  setRetirementAge: vi.fn(),
  setPlanningHorizonAge: vi.fn(),
  setMonthlyContribution: vi.fn(),
  setDesiredSpending: vi.fn(),
  setRetirementIncome: vi.fn(),
  setAnnualReturn: vi.fn(),
  setInflationRate: vi.fn(),
  simulateAtSpending: vi.fn(),
  resetToDefaults: vi.fn(),
};

const mockRmdTracking: {
  statuses: RmdAccountStatus[];
  reminders: RmdAccountStatus[];
  dueCount: number;
  loading: boolean;
  error: string | null;
  refresh: ReturnType<typeof vi.fn>;
} = {
  statuses: [],
  reminders: [],
  dueCount: 0,
  loading: false,
  error: null,
  refresh: vi.fn(),
};

const mockLinkedGoals = {
  linkedGoals: [],
  loading: false,
  error: null,
  refresh: vi.fn(),
};

const mockGoals = {
  goals: [{ name: 'College fund' }],
  loading: false,
  error: null,
  refresh: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  contributeToGoal: vi.fn(),
  deleteGoal: vi.fn(),
};

const mockBudgets = {
  budgets: [
    {
      name: 'Mortgage',
      period: 'MONTHLY',
      amount: { amount: 200000 },
      spentAmount: { amount: 180000 },
      remainingAmount: { amount: 20000 },
    },
  ],
  loading: false,
  error: null,
  refresh: vi.fn(),
  createBudget: vi.fn(),
  createBudgetTemplate: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  getBudgetSpendingBreakdown: vi.fn(),
};

const mockSweepRules = {
  rules: [],
  evaluations: [],
  log: [],
  loading: false,
  addRoundUpRule: vi.fn(),
  addPercentRule: vi.fn(),
  addThresholdRule: vi.fn(),
  addFixedRule: vi.fn(),
  deleteRule: vi.fn(),
  toggleRule: vi.fn(),
  simulate: vi.fn(),
  clearLog: vi.fn(),
};

vi.mock('../hooks/useScenarioModeler', () => ({
  useScenarioModeler: vi.fn(() => mockScenarioModeler),
}));

vi.mock('../hooks/useRetirementPlanner', () => ({
  useRetirementPlanner: vi.fn(() => mockRetirementPlanner),
}));

vi.mock('../hooks/useRmdTracking', () => ({
  useRmdTracking: vi.fn(() => mockRmdTracking),
}));

vi.mock('../hooks/useLinkedGoals', () => ({
  useLinkedGoals: vi.fn(() => mockLinkedGoals),
}));

vi.mock('../hooks/useGoals', () => ({
  useGoals: vi.fn(() => mockGoals),
}));

vi.mock('../hooks/useBudgets', () => ({
  useBudgets: vi.fn(() => mockBudgets),
}));

vi.mock('../hooks/useSweepRules', () => ({
  useSweepRules: vi.fn(() => mockSweepRules),
}));

vi.mock('../components/charts', () => ({
  TrendLineChart: ({ title }: { title?: string }) => <div role="img">{title}</div>,
}));

vi.mock('../lib/currency', () => ({
  formatCurrency: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

vi.mock('../components/common', () => ({
  LoadingSpinner: () => <div role="status">Loading…</div>,
  ErrorBanner: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  EmptyState: () => null,
  CurrencyDisplay: () => null,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('retirement healthcare projection', () => {
  it('projects Medicare premiums and out-of-pocket costs with healthcare inflation', () => {
    const projection = projectRetirementHealthcareCosts({
      retirementAge: 65,
      projectionEndAge: 67,
      desiredAnnualRetirementSpendingCents: 6000000,
      generalInflationRate: 0.03,
      healthcareInflationRate: 0.05,
      annualRetirementIncomeCents: 6000000,
      partBMonthlyPremiumCents: 17500,
      partDMonthlyPremiumCents: 5000,
      medigapMonthlyPremiumCents: 15000,
      outOfPocketAnnualCents: 300000,
    });

    expect(projection.years).toHaveLength(3);
    expect(projection.years[0]).toMatchObject({
      age: 65,
      partBAnnualCents: 210000,
      partDAnnualCents: 60000,
      medigapAnnualCents: 180000,
      outOfPocketCents: 300000,
      totalAnnualCents: 750000,
    });
    expect(projection.years[1].totalAnnualCents).toBe(787500);
    expect(projection.years[2].totalAnnualCents).toBe(826875);
    expect(projection.cumulativeHealthcareCents).toBe(2364375);
    expect(projection.healthcareShareOfSpending).toBeCloseTo(2364375 / 18545400, 6);
  });

  it('models a higher pre-65 ACA/private coverage gap before Medicare starts', () => {
    const projection = projectRetirementHealthcareCosts({
      retirementAge: 62,
      projectionEndAge: 65,
      desiredAnnualRetirementSpendingCents: 6000000,
      generalInflationRate: 0.03,
      healthcareInflationRate: 0.06,
      annualRetirementIncomeCents: 6000000,
      partBMonthlyPremiumCents: 17500,
      partDMonthlyPremiumCents: 5000,
      medigapMonthlyPremiumCents: 15000,
      outOfPocketAnnualCents: 300000,
      preMedicareMonthlyPremiumCents: 100000,
      preMedicareOutOfPocketAnnualCents: 400000,
    });

    expect(projection.preMedicareGapYears).toBe(3);
    expect(projection.years[0]).toMatchObject({
      age: 62,
      isPreMedicareGap: true,
      partBAnnualCents: 0,
      partDAnnualCents: 0,
      medigapAnnualCents: 0,
      preMedicarePremiumAnnualCents: 1200000,
      totalAnnualCents: 1600000,
    });
    expect(projection.years[1].totalAnnualCents).toBe(1696000);
    expect(projection.years[2].totalAnnualCents).toBe(1797760);
    expect(projection.years[3].isPreMedicareGap).toBe(false);
  });

  it('adds IRMAA surcharges for high retirement income', () => {
    const projection = projectRetirementHealthcareCosts({
      retirementAge: 65,
      projectionEndAge: 65,
      desiredAnnualRetirementSpendingCents: 15000000,
      generalInflationRate: 0.03,
      healthcareInflationRate: 0.05,
      annualRetirementIncomeCents: 15000000,
      partBMonthlyPremiumCents: 17500,
      partDMonthlyPremiumCents: 5000,
      medigapMonthlyPremiumCents: 15000,
      outOfPocketAnnualCents: 300000,
    });

    expect(calculateIrmaaMonthlySurchargeCents(15000000)).toBe(20800);
    expect(projection.irmaaSurchargeMonthlyCents).toBe(20800);
    expect(projection.years[0].irmaaSurchargeAnnualCents).toBe(249600);
    expect(projection.years[0].totalAnnualCents).toBe(999600);
  });
});

describe('life event timeline helpers', () => {
  it('orders events by date and computes cumulative free cash flow', () => {
    const projections = computeLifeEventProjections(
      [
        { id: 'college', name: 'College starts', date: '2030-09', monthlyCostChangeCents: 50000 },
        {
          id: 'childcare',
          name: 'Childcare ends',
          date: '2027-09',
          monthlyCostChangeCents: -120000,
        },
        {
          id: 'mortgage',
          name: 'Mortgage paid off',
          date: '2031-01',
          monthlyCostChangeCents: -150000,
        },
      ],
      25000,
    );

    expect(projections.map((event) => event.name)).toEqual([
      'Childcare ends',
      'College starts',
      'Mortgage paid off',
    ]);
    expect(projections.map((event) => event.monthlyFreeCashFlowDeltaCents)).toEqual([
      120000, -50000, 150000,
    ]);
    expect(projections.map((event) => event.projectedMonthlyFreeCashFlowCents)).toEqual([
      145000, 95000, 245000,
    ]);
  });

  it('sorts same-month events by name and converts budget cushion to monthly cash flow', () => {
    const sorted = sortLifeEvents([
      { id: 'b', name: 'Zoo membership ends', date: '2028-06', monthlyCostChangeCents: -2000 },
      { id: 'a', name: 'After-school care ends', date: '2028-06', monthlyCostChangeCents: -30000 },
    ]);

    expect(sorted.map((event) => event.name)).toEqual([
      'After-school care ends',
      'Zoo membership ends',
    ]);
    expect(
      computeBudgetMonthlyFreeCashFlowCents([
        { period: 'MONTHLY', remainingAmount: { amount: 30000 } },
        { period: 'YEARLY', remainingAmount: { amount: 120000 } },
      ]),
    ).toBe(40000);
  });

  it('builds specific reallocation guidance for freed cash flow', () => {
    const guidance = buildReallocationGuidance(
      120000,
      [{ name: 'College fund' }],
      [{ name: 'Mortgage' }],
    );

    expect(guidance).toEqual([
      { label: 'Boost College fund', amountCents: 54000 },
      { label: 'Increase retirement contributions', amountCents: 36000 },
      { label: 'Accelerate debt payoff', amountCents: 18000 },
      { label: 'Build emergency savings', amountCents: 12000 },
    ]);
  });
});

describe('PlanningPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.clearAllMocks();
    mockRetirementPlanner.params.currentAge = 30;
    mockRmdTracking.statuses = [];
    mockRmdTracking.reminders = [];
    mockRmdTracking.dueCount = 0;
    mockRmdTracking.loading = false;
    mockRmdTracking.error = null;
    localStorage.clear();
  });

  it('renders the page title', () => {
    render(<PlanningPage />);
    expect(screen.getByText('Financial Planning')).toBeTruthy();
  });

  it('renders all five tabs', () => {
    render(<PlanningPage />);
    expect(screen.getByRole('tab', { name: /what-if modeler/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /life events/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /retirement/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /savings goals/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /automations/i })).toBeTruthy();
  });

  it('shows scenarios panel by default', () => {
    render(<PlanningPage />);
    expect(screen.getByRole('tab', { name: /what-if modeler/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches to retirement tab on click', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /retirement/i }));
    expect(screen.getByRole('tab', { name: /retirement/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(/readiness/i)).toBeTruthy();
  });

  it('shows readiness score on retirement tab', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /retirement/i }));
    expect(screen.getByRole('progressbar', { name: /readiness score/i })).toBeTruthy();
  });

  it('shows retirement income projection answer and chart', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /retirement/i }));

    expect(screen.getByText(/lasts through age 90/i)).toBeTruthy();
    expect(screen.getByText('Retirement balance over time')).toBeTruthy();
  });

  it('updates retirement what-if sliders live', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /retirement/i }));

    fireEvent.change(screen.getByLabelText('Retirement Age'), { target: { value: '67' } });
    fireEvent.change(screen.getByLabelText('Desired Monthly Spending (Retirement)'), {
      target: { value: '450000' },
    });

    expect(mockRetirementPlanner.setRetirementAge).toHaveBeenCalledWith(67);
    expect(mockRetirementPlanner.setDesiredSpending).toHaveBeenCalledWith(450000);
  });

  it('adds a life event and shows reallocation guidance', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /life events/i }));

    fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: 'Childcare ends' } });
    fireEvent.change(screen.getByLabelText(/event month/i), { target: { value: '2027-09' } });
    fireEvent.change(screen.getByLabelText(/monthly cost change/i), {
      target: { value: '-1200' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add event/i }));

    expect(screen.getByRole('heading', { name: 'Childcare ends' })).toBeTruthy();
    expect(screen.getByText(/Frees \$1200.00\/mo/i)).toBeTruthy();
    expect(screen.getByText(/Boost College fund: \$540.00\/mo/i)).toBeTruthy();
    expect(screen.getByText(/Projected monthly free cash flow: \$1400.00/i)).toBeTruthy();
  });

  it('offers a new-baby life-event template that adds childcare costs (#3388)', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /life events/i }));

    fireEvent.click(screen.getByRole('button', { name: 'New baby arrives' }));
    fireEvent.click(screen.getByRole('button', { name: /add event/i }));

    expect(screen.getByRole('heading', { name: 'New baby arrives' })).toBeTruthy();
    expect(screen.getByText(/Adds \$1800\.00\/mo/i)).toBeTruthy();
  });

  it('shows empty state on goals tab when no goals', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /savings goals/i }));
    expect(screen.getByText(/no savings goals/i)).toBeTruthy();
  });

  it('shows empty state on sweep tab when no rules', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /automations/i }));
    expect(screen.getByText(/no sweep rules/i)).toBeTruthy();
  });

  it('has proper tabpanel ARIA structure', () => {
    render(<PlanningPage />);
    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-scenarios');
  });

  it('create scenario button is disabled with empty name', () => {
    render(<PlanningPage />);
    const createBtn = screen.getByRole('button', {
      name: /create new scenario/i,
    });
    expect(createBtn).toBeDisabled();
  });

  it('calculates RMD from prior-year-end balance and the uniform lifetime table', () => {
    expect(calculateRequiredMinimumDistribution(100000000, 73)).toBe(Math.ceil(100000000 / 26.5));
  });

  it('looks up IRS Uniform Lifetime Table periods and caps very old ages', () => {
    expect(getUniformLifetimeDistributionPeriod(72)).toBeNull();
    expect(getUniformLifetimeDistributionPeriod(73)).toBe(26.5);
    expect(getUniformLifetimeDistributionPeriod(90)).toBe(12.2);
    expect(getUniformLifetimeDistributionPeriod(121)).toBe(2.0);
  });

  it('shows RMD tracking and reminders on the retirement tab', () => {
    mockRetirementPlanner.params.currentAge = 73;
    const status: RmdAccountStatus = {
      accountId: 'ira-1',
      accountName: 'Traditional IRA',
      priorYearEndBalanceCents: 100000000,
      distributionPeriod: 26.5,
      requiredCents: Math.ceil(100000000 / 26.5),
      withdrawnCents: 1000000,
      remainingCents: Math.ceil(100000000 / 26.5) - 1000000,
      deadline: '2026-04-01',
      daysUntilDeadline: 30,
      isFirstYear: true,
      isSatisfied: false,
      urgency: 'due-soon',
    };
    mockRmdTracking.statuses = [status];
    mockRmdTracking.reminders = [status];
    mockRmdTracking.dueCount = 1;

    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /retirement/i }));

    expect(screen.getByRole('region', { name: /required minimum distributions/i })).toBeTruthy();
    expect(screen.getByText('Traditional IRA')).toBeTruthy();
    expect(screen.getByText('Required RMD')).toBeTruthy();
    expect(screen.getByText('$37735.85')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent(/rmd reminder/i);
  });

  it('surfaces a wedding workspace tab with the budgeted-vs-actual summary', () => {
    render(<PlanningPage />);
    expect(screen.getByRole('tab', { name: /wedding/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /wedding/i }));

    expect(screen.getByRole('heading', { name: /wedding budget workspace/i })).toBeTruthy();
    expect(screen.getByLabelText(/guest count/i)).toHaveValue(75);
    // Default seed is within the $35,000 budget at 75 guests ($34,700 estimated).
    expect(screen.getByText('$34700.00')).toBeTruthy();
    expect(screen.getByText(/within your/i)).toBeTruthy();
  });

  it('recomputes guest-scaled totals live and reflects vendor deposits', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /wedding/i }));

    const guestInput = screen.getByLabelText(/guest count/i);
    const vendorList = screen.getByRole('list', { name: /wedding vendors/i });
    const cateringRow = within(vendorList).getByText('Catering').closest('li') as HTMLElement;

    // At 75 guests: catering = $3,000 base + $85 * 75 = $9,375; $1,000 deposit leaves $8,375.
    expect(within(cateringRow).getByText('$9375.00')).toBeTruthy();
    expect(within(cateringRow).getByText('$1000.00')).toBeTruthy();
    expect(within(cateringRow).getByText('$8375.00')).toBeTruthy();

    // Growing the guest list recomputes per-guest estimates and trips the over-budget state.
    fireEvent.change(guestInput, { target: { value: '100' } });

    expect(screen.getByText('$37700.00')).toBeTruthy();
    expect(screen.getByText(/over budget by/i)).toBeTruthy();
    // Catering at 100 guests: $3,000 + $85 * 100 = $11,500; $1,000 deposit leaves $10,500.
    expect(within(cateringRow).getByText('$11500.00')).toBeTruthy();
    expect(within(cateringRow).getByText('$10500.00')).toBeTruthy();
  });

  it('lets a couple add a wedding vendor with its deposit and due date', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /wedding/i }));

    fireEvent.change(screen.getByLabelText(/vendor name/i), { target: { value: 'Live band' } });
    fireEvent.change(screen.getByLabelText(/budgeted \(usd\)/i), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText(/deposit paid/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /add vendor/i }));

    const vendorList = screen.getByRole('list', { name: /wedding vendors/i });
    const bandRow = within(vendorList).getByText('Live band').closest('li') as HTMLElement;
    expect(within(bandRow).getByText('$2500.00')).toBeTruthy(); // estimate
    expect(within(bandRow).getByText('$500.00')).toBeTruthy(); // deposit
    expect(within(bandRow).getByText('$2000.00')).toBeTruthy(); // remaining
  });

  it('surfaces a College Fund tab with a live 529 funding projection', () => {
    render(<PlanningPage />);
    expect(screen.getByRole('tab', { name: /college fund/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /college fund/i }));

    expect(screen.getByRole('heading', { name: /college fund \(529\) planner/i })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /college costs/i })).toBeTruthy();
    expect(screen.getByText('Projected cost')).toBeTruthy();
    expect(screen.getByText('Needed / month')).toBeTruthy();
    expect(screen.getByText('Annual tax benefit')).toBeTruthy();
    // The default seed ($250/mo from birth) does not fully fund four years of college.
    expect(screen.getAllByText(/short/i).length).toBeGreaterThan(0);
  });

  it('recomputes 529 coverage live when the monthly contribution changes', () => {
    render(<PlanningPage />);
    fireEvent.click(screen.getByRole('tab', { name: /college fund/i }));

    const bar = screen.getByRole('progressbar', { name: /college costs/i });
    // A large monthly contribution fully funds the goal and flips the status to on-track.
    fireEvent.change(screen.getByLabelText('Monthly contribution (USD)'), {
      target: { value: '5000' },
    });

    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getAllByText(/on track/i).length).toBeGreaterThan(0);
  });
});
