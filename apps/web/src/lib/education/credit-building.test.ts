// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the beginner credit-building education content (issue #2174).
 */

import { describe, expect, it } from 'vitest';

import {
  CREDIT_CHECKLIST_KEYS,
  CREDIT_EXPLAINER_KEYS,
  SECURED_CARD_STEP_KEYS,
  formatChecklistProgress,
  getCreditEducation,
  resolveCreditEducationLocale,
} from './credit-building';

const LOCALES = ['en', 'es'] as const;

describe('credit-building education content', () => {
  it('covers the five required plain-language explainers in canonical order', () => {
    expect(CREDIT_EXPLAINER_KEYS).toEqual([
      'fico',
      'utilization',
      'statementVsDue',
      'hardInquiries',
      'creditReports',
    ]);
  });

  it('covers the four secured-card guidance steps', () => {
    expect(SECURED_CARD_STEP_KEYS).toEqual([
      'deposit',
      'lowUtilization',
      'onTimePayments',
      'graduation',
    ]);
  });

  it('resolves any locale string to English or Spanish, defaulting to English', () => {
    expect(resolveCreditEducationLocale('es-ES')).toBe('es');
    expect(resolveCreditEducationLocale('es')).toBe('es');
    expect(resolveCreditEducationLocale('en-US')).toBe('en');
    expect(resolveCreditEducationLocale('de-DE')).toBe('en');
    expect(resolveCreditEducationLocale(null)).toBe('en');
    expect(resolveCreditEducationLocale(undefined)).toBe('en');
  });

  it.each(LOCALES)('provides complete, non-empty content for %s', (locale) => {
    const content = getCreditEducation(locale);
    expect(content.locale).toBe(locale);
    expect(content.sectionTitle.length).toBeGreaterThan(0);
    expect(content.sectionIntro.length).toBeGreaterThan(0);
    expect(content.disclaimer.length).toBeGreaterThan(0);

    expect(content.explainers.map((entry) => entry.id)).toEqual([...CREDIT_EXPLAINER_KEYS]);
    for (const entry of content.explainers) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
      expect(entry.whyItMatters.length).toBeGreaterThan(0);
    }

    expect(content.securedSteps.map((step) => step.id)).toEqual([...SECURED_CARD_STEP_KEYS]);
    for (const step of content.securedSteps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }

    expect(content.checklistItems.map((item) => item.id)).toEqual([...CREDIT_CHECKLIST_KEYS]);
    for (const item of content.checklistItems) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });

  it('explains FICO, utilization, statement vs. due date, hard inquiries, and credit reports', () => {
    const english = getCreditEducation('en');
    const bodies = english.explainers.map((entry) => `${entry.title} ${entry.body}`.toLowerCase());

    expect(bodies[0]).toContain('fico');
    expect(bodies[1]).toContain('utilization');
    expect(bodies[2]).toContain('due date');
    expect(bodies[3]).toContain('hard inquiry');
    expect(bodies[4]).toContain('credit report');
  });

  it('covers secured-card deposit, low utilization, on-time payments, and graduation', () => {
    const english = getCreditEducation('en');
    const text = english.securedSteps
      .map((step) => `${step.title} ${step.body}`)
      .join(' ')
      .toLowerCase();

    expect(english.securedIntro.toLowerCase()).toContain('deposit');
    expect(text).toContain('deposit');
    expect(text).toContain('utilization');
    expect(text).toContain('on time');
    expect(text).toContain('graduate');
  });

  it('mentions ITIN so newcomers without an SSN are supported', () => {
    expect(getCreditEducation('en').securedIntro).toContain('ITIN');
    expect(getCreditEducation('es').securedIntro).toContain('ITIN');
  });

  it('never asks the reader to buy or pull a real credit score', () => {
    for (const locale of LOCALES) {
      const content = getCreditEducation(locale);
      const checklistText = content.checklistItems
        .map((item) => `${item.label} ${item.detail}`)
        .join(' ')
        .toLowerCase();

      // The score-free promise is stated explicitly...
      expect(content.checklistNoScoreNote.toLowerCase()).toMatch(/score|puntuaci/);
      // ...and the only report-related step is a soft pull, framed around the
      // free *report*, never a paid score check.
      expect(checklistText).toMatch(/report|informe/);
      expect(checklistText).not.toMatch(/buy a score|comprar una puntuaci/);
    }
  });

  it('fills the checklist progress template with done and total counts', () => {
    expect(formatChecklistProgress(getCreditEducation('en'), 3, 8)).toBe('3 of 8 steps done');
    expect(formatChecklistProgress(getCreditEducation('es'), 3, 8)).toBe(
      '3 de 8 pasos completados',
    );
  });
});
