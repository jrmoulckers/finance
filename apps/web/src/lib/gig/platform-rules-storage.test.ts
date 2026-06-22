// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for gig-platform rule + expected-payout localStorage persistence.
 *
 * References: issue #2133
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGigPlatformRule,
  deleteGigPlatformRule,
  loadExpectedPayouts,
  loadGigPlatformRules,
  saveGigPlatformRules,
  setExpectedPayout,
  toggleGigPlatformRule,
} from './platform-rules-storage';
import { DEFAULT_GIG_PLATFORM_RULES } from './platform-earnings';

describe('platform-rules-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds the built-in defaults when nothing is stored', () => {
    const rules = loadGigPlatformRules();
    expect(rules).toHaveLength(DEFAULT_GIG_PLATFORM_RULES.length);
    expect(rules.map((r) => r.platform)).toContain('Uber');
    expect(rules.every((r) => r.isBuiltIn)).toBe(true);
  });

  it('returns defaults (and does not throw) on corrupt storage', () => {
    localStorage.setItem('finance-gig-platform-rules', '{not valid json');
    const rules = loadGigPlatformRules();
    expect(rules.length).toBe(DEFAULT_GIG_PLATFORM_RULES.length);
  });

  it('filters out malformed persisted rules', () => {
    localStorage.setItem(
      'finance-gig-platform-rules',
      JSON.stringify([
        {
          id: 'ok',
          platform: 'X',
          matchField: 'any',
          keywords: ['x'],
          enabled: true,
          isBuiltIn: false,
          createdAt: 'now',
        },
        { bogus: true },
      ]),
    );
    const rules = loadGigPlatformRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].platform).toBe('X');
  });

  it('creates a custom rule and prepends it (user precedence)', () => {
    const rule = createGigPlatformRule({
      platform: 'Shipt',
      matchField: 'payee',
      keywords: ['shipt'],
    });
    expect(rule.isBuiltIn).toBe(false);
    const rules = loadGigPlatformRules();
    expect(rules[0].platform).toBe('Shipt');
    expect(rules.length).toBe(DEFAULT_GIG_PLATFORM_RULES.length + 1);
  });

  it('trims keywords and rejects empty input', () => {
    expect(() =>
      createGigPlatformRule({ platform: '  ', matchField: 'any', keywords: ['x'] }),
    ).toThrow();
    expect(() =>
      createGigPlatformRule({ platform: 'X', matchField: 'any', keywords: ['  ', ''] }),
    ).toThrow();
    const rule = createGigPlatformRule({
      platform: 'X',
      matchField: 'any',
      keywords: ['  foo  ', 'bar'],
    });
    expect(rule.keywords).toEqual(['foo', 'bar']);
  });

  it('toggles a rule enabled flag and persists it', () => {
    saveGigPlatformRules([...DEFAULT_GIG_PLATFORM_RULES]);
    const uber = loadGigPlatformRules().find((r) => r.platform === 'Uber')!;
    expect(uber.enabled).toBe(true);
    const toggled = toggleGigPlatformRule(uber.id);
    expect(toggled?.enabled).toBe(false);
    expect(loadGigPlatformRules().find((r) => r.id === uber.id)?.enabled).toBe(false);
  });

  it('deletes a rule', () => {
    const rule = createGigPlatformRule({
      platform: 'Shipt',
      matchField: 'any',
      keywords: ['shipt'],
    });
    expect(deleteGigPlatformRule(rule.id)).toBe(true);
    expect(loadGigPlatformRules().find((r) => r.id === rule.id)).toBeUndefined();
    expect(deleteGigPlatformRule('nope')).toBe(false);
  });

  it('stores and clears expected payouts', () => {
    setExpectedPayout('Uber', 50000);
    expect(loadExpectedPayouts()).toEqual({ Uber: 50000 });
    setExpectedPayout('DoorDash', 12345);
    expect(loadExpectedPayouts()).toEqual({ Uber: 50000, DoorDash: 12345 });
    // zero / negative removes the entry
    setExpectedPayout('Uber', 0);
    expect(loadExpectedPayouts()).toEqual({ DoorDash: 12345 });
  });

  it('returns an empty map on corrupt expected-payout storage', () => {
    localStorage.setItem('finance-gig-expected-payouts', 'oops');
    expect(loadExpectedPayouts()).toEqual({});
  });
});
