// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for PlanningPage — Financial planning tools hub.
 *
 * Mocks hooks (not repositories) following project testing conventions.
 *
 * References: #1743, #1735, #1721, #1679, #1644, #1635
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PlanningPage } from './PlanningPage';

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
  computing: false,
  setCurrentAge: vi.fn(),
  setRetirementAge: vi.fn(),
  setPlanningHorizonAge: vi.fn(),
  setMonthlyContribution: vi.fn(),
  setDesiredSpending: vi.fn(),
  setAnnualReturn: vi.fn(),
  setInflationRate: vi.fn(),
  simulateAtSpending: vi.fn(),
  resetToDefaults: vi.fn(),
};

const mockLinkedGoals = {
  linkedGoals: [],
  loading: false,
  error: null,
  refresh: vi.fn(),
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

vi.mock('../hooks/useLinkedGoals', () => ({
  useLinkedGoals: vi.fn(() => mockLinkedGoals),
}));

vi.mock('../hooks/useSweepRules', () => ({
  useSweepRules: vi.fn(() => mockSweepRules),
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

describe('PlanningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', () => {
    render(<PlanningPage />);
    expect(screen.getByText('Financial Planning')).toBeTruthy();
  });

  it('renders all four tabs', () => {
    render(<PlanningPage />);
    expect(screen.getByRole('tab', { name: /what-if modeler/i })).toBeTruthy();
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
});
