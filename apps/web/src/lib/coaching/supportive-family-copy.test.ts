// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  getSupportiveFamilyCopy,
  listSupportiveFamilyCopy,
  selectSupportiveFamilyCopy,
  SUPPORTIVE_FAMILY_COACHING_COPY,
} from './supportive-family-copy';

// Words that signal judgmental, shaming, or punitive framing. None of the
// supportive copy should contain any of these.
const JUDGMENTAL_PHRASES = [
  'over budget',
  'overspent',
  'overspending',
  'failed',
  'failure',
  'you should have',
  'irresponsible',
  'shame',
  'guilt',
  'bad job',
  'too much',
  'wasted',
  "can't afford",
];

describe('SUPPORTIVE_FAMILY_COACHING_COPY', () => {
  it('provides supportive copy for every expected scenario', () => {
    expect(Object.keys(SUPPORTIVE_FAMILY_COACHING_COPY).sort()).toEqual([
      'celebrate-small-win',
      'family-ready',
      'steady-and-supported',
      'tight-month-reframe',
    ]);
  });

  it('keeps every variant non-judgmental and complete', () => {
    for (const copy of listSupportiveFamilyCopy()) {
      const haystack = `${copy.headline} ${copy.body} ${copy.smallWin}`.toLowerCase();
      for (const phrase of JUDGMENTAL_PHRASES) {
        expect(haystack).not.toContain(phrase);
      }

      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(copy.smallWin.length).toBeGreaterThan(0);
    }
  });

  it('is frozen so shared copy cannot be mutated', () => {
    expect(Object.isFrozen(SUPPORTIVE_FAMILY_COACHING_COPY)).toBe(true);
  });
});

describe('getSupportiveFamilyCopy', () => {
  it('returns the requested variant by id', () => {
    expect(getSupportiveFamilyCopy('tight-month-reframe').id).toBe('tight-month-reframe');
    expect(getSupportiveFamilyCopy('family-ready').tone).toBe('supportive');
  });
});

describe('selectSupportiveFamilyCopy', () => {
  it('reframes a tight category as a hard month with one small win', () => {
    const copy = selectSupportiveFamilyCopy({ tightCategoryName: 'Childcare & Daycare' });

    expect(copy.id).toBe('tight-month-reframe');
    expect(copy.tone).toBe('reassuring');
    expect(copy.smallWin.toLowerCase()).toContain('small win');
  });

  it('celebrates a clear win', () => {
    const copy = selectSupportiveFamilyCopy({ hadSmallWin: true });

    expect(copy.id).toBe('celebrate-small-win');
    expect(copy.tone).toBe('celebratory');
  });

  it('prioritizes a tight month over a win when both are present', () => {
    const copy = selectSupportiveFamilyCopy({
      tightCategoryName: 'School Fees',
      hadSmallWin: true,
    });

    expect(copy.id).toBe('tight-month-reframe');
  });

  it('welcomes the caregiver once the preset is complete', () => {
    expect(selectSupportiveFamilyCopy({ presetComplete: true }).id).toBe('family-ready');
  });

  it('falls back to steady encouragement with no signals', () => {
    expect(selectSupportiveFamilyCopy().id).toBe('steady-and-supported');
    expect(selectSupportiveFamilyCopy({}).id).toBe('steady-and-supported');
  });
});
