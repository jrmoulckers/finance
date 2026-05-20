// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  computeOverallScore,
  computePortfolioESG,
  computePortfolioESGSummary,
  createESGScore,
  formatCategory,
  screenHolding,
} from './esg-scoring';
import type { ESGHolding, ESGScore, ScreeningPreferences } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const scores = new Map<string, ESGScore>([
  ['AAPL', { symbol: 'AAPL', environmental: 75, social: 80, governance: 85, overall: 80 }],
  ['XOM', { symbol: 'XOM', environmental: 30, social: 50, governance: 60, overall: 46.67 }],
  ['MSFT', { symbol: 'MSFT', environmental: 85, social: 90, governance: 88, overall: 87.67 }],
]);

const holdings: ESGHolding[] = [
  { symbol: 'AAPL', companyName: 'Apple Inc', marketValueCents: 5000000 },
  {
    symbol: 'XOM',
    companyName: 'Exxon Mobil',
    marketValueCents: 3000000,
    categories: ['FOSSIL_FUELS'],
  },
  { symbol: 'MSFT', companyName: 'Microsoft', marketValueCents: 2000000 },
];

const preferences: ScreeningPreferences = {
  excludedCategories: ['FOSSIL_FUELS', 'TOBACCO', 'WEAPONS'],
  minimumOverallScore: 50,
  minimumEnvironmental: 40,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeOverallScore', () => {
  it('computes equal-weighted average', () => {
    // (75 + 80 + 85) / 3 = 80
    expect(computeOverallScore(75, 80, 85)).toBe(80);
  });

  it('clamps sub-scores to 0-100', () => {
    const score = computeOverallScore(-10, 150, 50);
    // (0 + 100 + 50) / 3 = 50
    expect(score).toBe(50);
  });
});

describe('createESGScore', () => {
  it('creates an ESG score with computed overall', () => {
    const score = createESGScore('AAPL', 75, 80, 85);
    expect(score.symbol).toBe('AAPL');
    expect(score.overall).toBe(80);
    expect(score.environmental).toBe(75);
  });

  it('clamps values', () => {
    const score = createESGScore('X', -5, 110, 50);
    expect(score.environmental).toBe(0);
    expect(score.social).toBe(100);
  });
});

describe('computePortfolioESG', () => {
  it('computes weighted scores', () => {
    const result = computePortfolioESG(holdings, scores);
    // Total: 10M
    // AAPL: 50% weight, XOM: 30%, MSFT: 20%
    // E: 75*0.5 + 30*0.3 + 85*0.2 = 37.5 + 9 + 17 = 63.5
    expect(result.environmental).toBeCloseTo(63.5, 1);
    expect(result.overall).toBeGreaterThan(0);
  });

  it('returns zeros for empty portfolio', () => {
    const result = computePortfolioESG([], scores);
    expect(result.environmental).toBe(0);
  });
});

describe('screenHolding', () => {
  it('flags excluded category', () => {
    const holding = holdings[1]; // XOM with FOSSIL_FUELS
    const alerts = screenHolding(holding, scores.get('XOM'), preferences);
    const categoryAlert = alerts.find((a) => a.alertType === 'EXCLUDED_CATEGORY');
    expect(categoryAlert).toBeDefined();
    expect(categoryAlert?.category).toBe('FOSSIL_FUELS');
  });

  it('flags low overall score', () => {
    const holding = holdings[1]; // XOM
    const alerts = screenHolding(holding, scores.get('XOM'), preferences);
    const scoreAlert = alerts.find((a) => a.alertType === 'LOW_SCORE' && a.threshold === 50);
    expect(scoreAlert).toBeDefined();
  });

  it('returns no alerts for clean holding', () => {
    const holding = holdings[2]; // MSFT
    const alerts = screenHolding(holding, scores.get('MSFT'), preferences);
    expect(alerts).toHaveLength(0);
  });

  it('handles unscored holdings gracefully', () => {
    const holding: ESGHolding = {
      symbol: 'UNKNOWN',
      companyName: 'Unknown Corp',
      marketValueCents: 100000,
    };
    const alerts = screenHolding(holding, undefined, preferences);
    expect(alerts).toHaveLength(0);
  });
});

describe('formatCategory', () => {
  it('formats category labels', () => {
    expect(formatCategory('FOSSIL_FUELS')).toBe('Fossil Fuels');
    expect(formatCategory('PRIVATE_PRISONS')).toBe('Private Prisons');
  });
});

describe('computePortfolioESGSummary', () => {
  it('computes full summary with alerts', () => {
    const summary = computePortfolioESGSummary(holdings, scores, preferences);
    expect(summary.scoredHoldingsCount).toBe(3);
    expect(summary.unscoredHoldingsCount).toBe(0);
    expect(summary.weightedOverall).toBeGreaterThan(0);
    // XOM should have at least 1 alert (FOSSIL_FUELS exclusion)
    expect(summary.alerts.length).toBeGreaterThan(0);
  });

  it('counts unscored holdings', () => {
    const unscoredHoldings: ESGHolding[] = [
      ...holdings,
      { symbol: 'PRIV', companyName: 'Private Corp', marketValueCents: 100000 },
    ];
    const summary = computePortfolioESGSummary(unscoredHoldings, scores, preferences);
    expect(summary.unscoredHoldingsCount).toBe(1);
  });
});
