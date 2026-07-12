// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  COGNITIVE_PERSONAS,
  getSimpleModePlan,
  shouldSuppressInSimpleMode,
  simplifyFinancialCopy,
  validatePersonaCoverage,
  validateSimpleModeCopy,
} from '../simple-mode';

describe('simple mode helpers', () => {
  it('defines one primary action and reduced regions for dashboard', () => {
    const plan = getSimpleModePlan('dashboard');

    expect(plan.primaryAction).toBe('Add transaction');
    expect(plan.visibleRegions).toContain('balance summary');
    expect(plan.collapsedRegions).toContain('advanced insights');
  });

  it('replaces jargon with plain language', () => {
    expect(simplifyFinancialCopy('Review variance and liquidity before reconciliation.')).toBe(
      'Review difference from plan and money available soon before match records.',
    );
  });

  it('suppresses non-critical prompts that increase cognitive load', () => {
    expect(shouldSuppressInSimpleMode('Show non-critical celebration banner')).toBe(true);
    expect(shouldSuppressInSimpleMode('Bill due tomorrow')).toBe(false);
  });
});

describe('cognitive-accessibility persona validation (#2505)', () => {
  it('covers at least three cognitive-accessibility personas', () => {
    expect(COGNITIVE_PERSONAS.length).toBeGreaterThanOrEqual(3);
    for (const persona of COGNITIVE_PERSONAS) {
      expect(persona.needs.length).toBeGreaterThan(0);
      expect(persona.highStakesFlows.length).toBeGreaterThan(0);
    }
  });

  it('flags jargon and over-long sentences in simple-mode copy', () => {
    const result = validateSimpleModeCopy(
      'Your utilization is high, so reconciliation of every single pending transaction is required before we can safely reduce the amount you owe.',
    );

    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.kind === 'jargon')).toBe(true);
    expect(result.issues.some((issue) => issue.kind === 'long-sentence')).toBe(true);
    expect(result.simplified).not.toMatch(/utilization/i);
  });

  it('passes plain-language copy that keeps sentences short', () => {
    const result = validateSimpleModeCopy('Add a transaction. Check your bills. You are on track.');

    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('validates every persona high-stakes flow against the simple-mode plans', () => {
    const results = validatePersonaCoverage();

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.singlePrimaryAction).toBe(true);
      expect(result.progressiveDisclosure).toBe(true);
      expect(result.plainLanguageHeading).toBe(true);
      expect(result.passed).toBe(true);
    }
  });
});
