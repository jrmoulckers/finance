// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for investment recession simulator.
 *
 * References: issue #1746
 */

import { describe, expect, it } from 'vitest';
import type { AssetClassName } from './types';
import {
  COVID_RECESSION,
  DOT_COM_RECESSION,
  estimateAssetClassDecline,
  estimateRecoveryMonths,
  generateDefensiveSuggestions,
  GFC_2008_RECESSION,
  RECESSION_TEMPLATES,
  simulateAllRecessions,
  simulateHoldingImpacts,
  simulateRecession,
} from './recession-sim';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const diversifiedHoldings = [
  { symbol: 'VTI', assetClass: 'US_STOCKS' as AssetClassName, marketValueCents: 400000_00 },
  {
    symbol: 'VXUS',
    assetClass: 'INTERNATIONAL_STOCKS' as AssetClassName,
    marketValueCents: 200000_00,
  },
  { symbol: 'BND', assetClass: 'BONDS' as AssetClassName, marketValueCents: 300000_00 },
  { symbol: 'VMFXX', assetClass: 'CASH' as AssetClassName, marketValueCents: 100000_00 },
];

const techHeavyHoldings = [
  { symbol: 'QQQ', assetClass: 'US_STOCKS' as AssetClassName, marketValueCents: 800000_00 },
  { symbol: 'BTC', assetClass: 'CRYPTO' as AssetClassName, marketValueCents: 200000_00 },
];

// ---------------------------------------------------------------------------
// RECESSION_TEMPLATES
// ---------------------------------------------------------------------------

describe('RECESSION_TEMPLATES', () => {
  it('includes dot-com, GFC, and COVID', () => {
    expect(RECESSION_TEMPLATES).toHaveLength(3);
    expect(DOT_COM_RECESSION.id).toBe('dot-com');
    expect(GFC_2008_RECESSION.id).toBe('gfc-2008');
    expect(COVID_RECESSION.id).toBe('covid-2020');
  });

  it('all templates have negative peak declines', () => {
    for (const t of RECESSION_TEMPLATES) {
      expect(t.peakDeclinePercent).toBeLessThan(0);
    }
  });

  it('all templates have positive recovery months', () => {
    for (const t of RECESSION_TEMPLATES) {
      expect(t.recoveryMonths).toBeGreaterThan(0);
    }
  });

  it('all templates have sector impacts', () => {
    for (const t of RECESSION_TEMPLATES) {
      expect(t.sectorImpacts.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// estimateAssetClassDecline
// ---------------------------------------------------------------------------

describe('estimateAssetClassDecline', () => {
  it('US stocks decline at 1x market decline', () => {
    expect(estimateAssetClassDecline('US_STOCKS', -50)).toBe(-50);
  });

  it('bonds have inverse relationship (mild positive or flat)', () => {
    const decline = estimateAssetClassDecline('BONDS', -50);
    // Bonds multiplier is -0.1, so -50 * -0.1 = 5 (positive)
    expect(decline).toBeGreaterThan(0);
  });

  it('cash is unaffected', () => {
    const decline = estimateAssetClassDecline('CASH', -50);
    expect(Math.abs(decline)).toBe(0);
  });

  it('crypto declines more than equities', () => {
    const equityDecline = estimateAssetClassDecline('US_STOCKS', -50);
    const cryptoDecline = estimateAssetClassDecline('CRYPTO', -50);
    expect(Math.abs(cryptoDecline)).toBeGreaterThan(Math.abs(equityDecline));
  });

  it('international stocks decline slightly more than US', () => {
    const usDecline = estimateAssetClassDecline('US_STOCKS', -50);
    const intlDecline = estimateAssetClassDecline('INTERNATIONAL_STOCKS', -50);
    expect(Math.abs(intlDecline)).toBeGreaterThan(Math.abs(usDecline));
  });
});

// ---------------------------------------------------------------------------
// simulateHoldingImpacts
// ---------------------------------------------------------------------------

describe('simulateHoldingImpacts', () => {
  it('produces one impact per holding', () => {
    const impacts = simulateHoldingImpacts(diversifiedHoldings, -50);
    expect(impacts).toHaveLength(diversifiedHoldings.length);
  });

  it('equity holdings decline', () => {
    const impacts = simulateHoldingImpacts(diversifiedHoldings, -50);
    const stocks = impacts.find((i) => i.symbol === 'VTI');
    expect(stocks!.estimatedValueCents).toBeLessThan(stocks!.currentValueCents);
  });

  it('cash holdings remain unchanged', () => {
    const impacts = simulateHoldingImpacts(diversifiedHoldings, -50);
    const cash = impacts.find((i) => i.symbol === 'VMFXX');
    expect(cash!.estimatedValueCents).toBe(cash!.currentValueCents);
  });

  it('values never go below zero', () => {
    const impacts = simulateHoldingImpacts(techHeavyHoldings, -99);
    for (const impact of impacts) {
      expect(impact.estimatedValueCents).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// estimateRecoveryMonths
// ---------------------------------------------------------------------------

describe('estimateRecoveryMonths', () => {
  it('scales recovery proportionally to drawdown', () => {
    // Portfolio drawdown same as template → same recovery
    expect(estimateRecoveryMonths(-50, -50, 49)).toBe(49);
  });

  it('returns shorter recovery for less severe drawdown', () => {
    const months = estimateRecoveryMonths(-25, -50, 49);
    expect(months).toBeLessThan(49);
  });

  it('returns at least 1 month', () => {
    expect(estimateRecoveryMonths(-1, -50, 49)).toBeGreaterThanOrEqual(1);
  });

  it('handles zero template drawdown', () => {
    expect(estimateRecoveryMonths(-25, 0, 49)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateDefensiveSuggestions
// ---------------------------------------------------------------------------

describe('generateDefensiveSuggestions', () => {
  it('suggests more bonds when allocation is low', () => {
    const equityHeavy = [
      { assetClass: 'US_STOCKS' as AssetClassName, marketValueCents: 900000_00 },
      { assetClass: 'BONDS' as AssetClassName, marketValueCents: 100000_00 },
    ];
    const suggestions = generateDefensiveSuggestions(equityHeavy);
    expect(suggestions.some((s) => s.includes('Bond'))).toBe(true);
  });

  it('suggests reducing crypto when allocation is high', () => {
    const cryptoHeavy = [
      { assetClass: 'CRYPTO' as AssetClassName, marketValueCents: 200000_00 },
      { assetClass: 'US_STOCKS' as AssetClassName, marketValueCents: 800000_00 },
    ];
    const suggestions = generateDefensiveSuggestions(cryptoHeavy);
    expect(suggestions.some((s) => s.includes('Crypto') || s.includes('crypto'))).toBe(true);
  });

  it('praises well-diversified portfolio', () => {
    const balanced = [
      { assetClass: 'US_STOCKS' as AssetClassName, marketValueCents: 300000_00 },
      { assetClass: 'INTERNATIONAL_STOCKS' as AssetClassName, marketValueCents: 100000_00 },
      { assetClass: 'BONDS' as AssetClassName, marketValueCents: 400000_00 },
      { assetClass: 'CASH' as AssetClassName, marketValueCents: 200000_00 },
    ];
    const suggestions = generateDefensiveSuggestions(balanced);
    expect(suggestions.some((s) => s.includes('diversified'))).toBe(true);
  });

  it('returns empty suggestions for empty portfolio', () => {
    expect(generateDefensiveSuggestions([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// simulateRecession
// ---------------------------------------------------------------------------

describe('simulateRecession', () => {
  it('produces a complete simulation result', () => {
    const result = simulateRecession(diversifiedHoldings, GFC_2008_RECESSION);
    expect(result.scenarioName).toBe(GFC_2008_RECESSION.name);
    expect(result.currentValueCents).toBe(1000000_00);
    expect(result.troughValueCents).toBeLessThan(result.currentValueCents);
    expect(result.drawdownPercent).toBeLessThan(0);
    expect(result.estimatedRecoveryMonths).toBeGreaterThan(0);
    expect(result.holdingImpacts).toHaveLength(diversifiedHoldings.length);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('shows worse impact on tech-heavy portfolio during dot-com', () => {
    const techResult = simulateRecession(techHeavyHoldings, DOT_COM_RECESSION);
    const diversifiedResult = simulateRecession(diversifiedHoldings, DOT_COM_RECESSION);

    expect(Math.abs(techResult.drawdownPercent)).toBeGreaterThan(
      Math.abs(diversifiedResult.drawdownPercent),
    );
  });

  it('COVID crash shows relatively mild drawdown for diversified portfolio', () => {
    const result = simulateRecession(diversifiedHoldings, COVID_RECESSION);
    expect(Math.abs(result.drawdownPercent)).toBeLessThan(
      Math.abs(GFC_2008_RECESSION.peakDeclinePercent),
    );
  });

  it('handles empty portfolio', () => {
    const result = simulateRecession([], GFC_2008_RECESSION);
    expect(result.currentValueCents).toBe(0);
    expect(result.troughValueCents).toBe(0);
    expect(result.holdingImpacts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// simulateAllRecessions
// ---------------------------------------------------------------------------

describe('simulateAllRecessions', () => {
  it('runs all built-in recession templates', () => {
    const results = simulateAllRecessions(diversifiedHoldings);
    expect(results).toHaveLength(RECESSION_TEMPLATES.length);
  });

  it('each result has the correct scenario name', () => {
    const results = simulateAllRecessions(diversifiedHoldings);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].scenarioName).toBe(RECESSION_TEMPLATES[i].name);
    }
  });

  it('2008 is more severe than COVID for equities', () => {
    const results = simulateAllRecessions(techHeavyHoldings);
    const gfc = results.find((r) => r.scenarioName.includes('Financial'));
    const covid = results.find((r) => r.scenarioName.includes('COVID'));
    expect(Math.abs(gfc!.drawdownPercent)).toBeGreaterThan(Math.abs(covid!.drawdownPercent));
  });
});
