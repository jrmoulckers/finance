// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  FIRE_PLANNING_DISCLAIMER,
  buildCoastFireCard,
  buildFireScenarioCards,
  deriveFirePlanningDefaults,
  loadFirePlanningAssumptions,
  resetFirePlanningAssumptions,
  saveFirePlanningAssumptions,
} from './fire-planning-view';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('fire planning view helpers', () => {
  it('persists manual assumptions and derives defaults with missing-input warnings', () => {
    const storage = new MemoryStorage();
    const saved = saveFirePlanningAssumptions(storage, {
      annualExpensesCents: 60_000_00,
      currentAge: 40,
      targetRetirementAge: 55,
      withdrawalRatePercent: 4,
    });

    const defaults = deriveFirePlanningDefaults(
      { investedAssetsCents: 250_000_00, annualExpensesCents: null, expenseEstimateIsStale: true },
      saved,
    );

    expect(loadFirePlanningAssumptions(storage)).toEqual(saved);
    expect(defaults.input.currentInvestedAssetsCents).toBe(250_000_00);
    expect(defaults.input.annualExpensesCents).toBe(60_000_00);
    expect(defaults.warnings).toContain('Annual expenses are missing; using manual FIRE defaults.');
    expect(defaults.warnings).toContain('Expense estimate may be stale.');
    expect(defaults.assumptionSummary).toContain(FIRE_PLANNING_DISCLAIMER);
    expect(resetFirePlanningAssumptions(storage).currentAge).toBe(35);
  });

  it('builds standard, Coast-FIRE, save-more, and lower-return cards', () => {
    const { input } = deriveFirePlanningDefaults({ investedAssetsCents: 300_000_00 }, {
      annualExpensesCents: 40_000_00,
      annualContributionsCents: 50_000_00,
      annualIncomeCents: 120_000_00,
      currentAge: 35,
      targetRetirementAge: 60,
      expectedRealReturnPercent: 6,
      withdrawalRatePercent: 4,
    });

    const cards = buildFireScenarioCards(input);
    const standard = cards.find((card) => card.id === 'standard-fire');
    const saveMore = cards.find((card) => card.id === 'save-more');
    const lowerReturn = cards.find((card) => card.id === 'lower-return');
    const coast = buildCoastFireCard(input);

    expect(cards.map((card) => card.id)).toEqual([
      'standard-fire',
      'coast-fire',
      'save-more',
      'lower-return',
    ]);
    expect(saveMore?.result.yearsToFI).toBeLessThanOrEqual(standard?.result.yearsToFI ?? 0);
    expect(lowerReturn?.result.yearsToFI).toBeGreaterThanOrEqual(standard?.result.yearsToFI ?? 0);
    expect(coast.headline).toContain('Coast-FIRE');
  });
});
