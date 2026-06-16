// SPDX-License-Identifier: BUSL-1.1

export type SimpleModeSurface =
  | 'dashboard'
  | 'transactions'
  | 'budgets'
  | 'bills'
  | 'goals'
  | 'reports'
  | 'settings';

export interface SimpleModePlan {
  surface: SimpleModeSurface;
  heading: string;
  primaryAction: string;
  visibleRegions: readonly string[];
  collapsedRegions: readonly string[];
  suppressedPatterns: readonly string[];
}

const SIMPLE_MODE_PLANS: Record<SimpleModeSurface, SimpleModePlan> = {
  dashboard: {
    surface: 'dashboard',
    heading: 'Today at a glance',
    primaryAction: 'Add transaction',
    visibleRegions: ['balance summary', 'upcoming bills', 'recent transactions'],
    collapsedRegions: ['trend charts', 'gamification', 'advanced insights'],
    suppressedPatterns: ['promotional prompt', 'non-critical celebration'],
  },
  transactions: {
    surface: 'transactions',
    heading: 'Transactions',
    primaryAction: 'Add transaction',
    visibleRegions: ['search', 'recent transaction cards', 'filters summary'],
    collapsedRegions: ['bulk tools', 'advanced filters', 'import diagnostics'],
    suppressedPatterns: ['duplicate nudge'],
  },
  budgets: {
    surface: 'budgets',
    heading: 'Budget check-in',
    primaryAction: 'Review over-budget items',
    visibleRegions: ['month status', 'needs attention', 'planned spending'],
    collapsedRegions: ['variance analytics', 'forecast chart'],
    suppressedPatterns: ['streak prompt'],
  },
  bills: {
    surface: 'bills',
    heading: 'Bills',
    primaryAction: 'Mark bill paid',
    visibleRegions: ['due soon', 'overdue', 'autopay status'],
    collapsedRegions: ['provider analytics', 'historical payment chart'],
    suppressedPatterns: ['upsell prompt'],
  },
  goals: {
    surface: 'goals',
    heading: 'Goals',
    primaryAction: 'Update progress',
    visibleRegions: ['active goals', 'next contribution', 'recent milestone'],
    collapsedRegions: ['projection details', 'celebration effects'],
    suppressedPatterns: ['non-critical celebration'],
  },
  reports: {
    surface: 'reports',
    heading: 'Reports',
    primaryAction: 'Choose report',
    visibleRegions: ['plain-language summary', 'saved reports'],
    collapsedRegions: ['comparison charts', 'export automation'],
    suppressedPatterns: ['advanced insight'],
  },
  settings: {
    surface: 'settings',
    heading: 'Settings',
    primaryAction: 'Review accessibility preferences',
    visibleRegions: ['accessibility', 'privacy', 'account'],
    collapsedRegions: ['developer diagnostics', 'sync internals'],
    suppressedPatterns: ['beta promotion'],
  },
};

const PLAIN_LANGUAGE_TERMS: Record<string, string> = {
  variance: 'difference from plan',
  reconciliation: 'match records',
  liquidity: 'money available soon',
  amortization: 'loan payoff schedule',
  allocation: 'how money is split',
};

export function getSimpleModePlan(surface: SimpleModeSurface): SimpleModePlan {
  return SIMPLE_MODE_PLANS[surface];
}

export function simplifyFinancialCopy(copy: string): string {
  return Object.entries(PLAIN_LANGUAGE_TERMS).reduce((result, [term, replacement]) => {
    const pattern = new RegExp(`\\b${term}\\b`, 'gi');
    return result.replace(pattern, replacement);
  }, copy);
}

export function shouldSuppressInSimpleMode(notificationText: string): boolean {
  const normalized = notificationText.toLowerCase();
  return Object.values(SIMPLE_MODE_PLANS).some((plan) =>
    plan.suppressedPatterns.some((pattern) => normalized.includes(pattern)),
  );
}
