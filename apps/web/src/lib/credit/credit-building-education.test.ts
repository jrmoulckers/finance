// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the beginner credit-building education module.
 *
 * Covers: lesson data integrity, recommended ordering, tip data and the
 * lesson lookup helper.
 *
 * References: issue #2174
 */

import { describe, expect, it } from 'vitest';

import {
  CREDIT_BUILDING_LESSONS,
  CREDIT_BUILDING_TIPS,
  getCreditLesson,
} from './credit-building-education';

describe('CREDIT_BUILDING_LESSONS', () => {
  it('provides a non-empty, structured set of lessons', () => {
    expect(CREDIT_BUILDING_LESSONS.length).toBeGreaterThanOrEqual(4);
  });

  it('gives every lesson a unique, stable id', () => {
    const ids = CREDIT_BUILDING_LESSONS.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('gives every lesson non-empty plain-language content', () => {
    for (const lesson of CREDIT_BUILDING_LESSONS) {
      expect(lesson.title.trim().length).toBeGreaterThan(0);
      expect(lesson.summary.trim().length).toBeGreaterThan(0);
      expect(lesson.body.trim().length).toBeGreaterThan(0);
      expect(lesson.takeaway.trim().length).toBeGreaterThan(0);
    }
  });

  it('covers the core beginner topics', () => {
    const ids = CREDIT_BUILDING_LESSONS.map((lesson) => lesson.id);
    expect(ids).toContain('what-is-a-credit-score');
    expect(ids).toContain('why-utilization-matters');
    expect(ids).toContain('on-time-payments');
    expect(ids).toContain('how-secured-cards-build-credit');
  });

  it('leads with what a credit score is', () => {
    expect(CREDIT_BUILDING_LESSONS[0]?.id).toBe('what-is-a-credit-score');
  });
});

describe('CREDIT_BUILDING_TIPS', () => {
  it('provides a non-empty set of unique tips', () => {
    expect(CREDIT_BUILDING_TIPS.length).toBeGreaterThan(0);
    const ids = CREDIT_BUILDING_TIPS.map((tip) => tip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every tip non-empty text', () => {
    for (const tip of CREDIT_BUILDING_TIPS) {
      expect(tip.text.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('getCreditLesson', () => {
  it('returns a lesson by id', () => {
    const lesson = getCreditLesson('why-utilization-matters');
    expect(lesson).toBeDefined();
    expect(lesson?.title).toBe('Why utilization matters');
  });

  it('returns undefined for an unknown id', () => {
    expect(getCreditLesson('does-not-exist')).toBeUndefined();
  });
});
