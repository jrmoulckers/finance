// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  adjustAllocation,
  advanceSetupStep,
  calculateTotalAllocation,
  createInitialSetupProgress,
  getAllTemplates,
  getEssentialCategories,
  getSetupSteps,
  getTemplateById,
  goBackSetupStep,
  scaleTemplateTo,
  selectTemplate,
} from './starter-templates';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAllTemplates', () => {
  it('returns all four templates', () => {
    const templates = getAllTemplates();
    expect(templates).toHaveLength(4);
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('basic');
    expect(ids).toContain('student');
    expect(ids).toContain('family');
    expect(ids).toContain('single-income');
  });

  it('all templates have positive totalSuggestedCents', () => {
    for (const template of getAllTemplates()) {
      expect(template.totalSuggestedCents).toBeGreaterThan(0);
    }
  });
});

describe('getTemplateById', () => {
  it('returns matching template', () => {
    const template = getTemplateById('student');
    expect(template).not.toBeNull();
    expect(template!.id).toBe('student');
  });

  it('returns null for unknown ID', () => {
    expect(getTemplateById('nonexistent' as 'basic')).toBeNull();
  });
});

describe('getEssentialCategories', () => {
  it('returns only essential categories', () => {
    const essentials = getEssentialCategories('basic');
    expect(essentials.length).toBeGreaterThan(0);
    expect(essentials.every((c) => c.isEssential)).toBe(true);
  });

  it('returns empty for unknown template', () => {
    expect(getEssentialCategories('nonexistent' as 'basic')).toEqual([]);
  });
});

describe('calculateTotalAllocation', () => {
  it('sums category allocations', () => {
    const template = getTemplateById('basic')!;
    const total = calculateTotalAllocation(template.categories);
    expect(total).toBe(template.totalSuggestedCents);
  });

  it('returns 0 for empty categories', () => {
    expect(calculateTotalAllocation([])).toBe(0);
  });
});

describe('scaleTemplateTo', () => {
  it('scales proportionally to new income', () => {
    const template = getTemplateById('basic')!;
    // Double the income
    const scaled = scaleTemplateTo(template, template.suggestedIncomeCents * 2);
    const total = scaled.reduce((sum, c) => sum + c.suggestedCents, 0);
    // Should be roughly double (rounding may cause 1-2 cent diff)
    expect(Math.abs(total - template.totalSuggestedCents * 2)).toBeLessThan(
      template.categories.length * 2,
    );
  });

  it('handles zero income', () => {
    const template = getTemplateById('basic')!;
    const scaled = scaleTemplateTo(template, 0);
    expect(scaled.every((c) => c.suggestedCents === 0)).toBe(true);
  });

  it('preserves category metadata', () => {
    const template = getTemplateById('student')!;
    const scaled = scaleTemplateTo(template, 200_000);
    expect(scaled[0].name).toBe(template.categories[0].name);
    expect(scaled[0].isEssential).toBe(template.categories[0].isEssential);
  });
});

describe('getSetupSteps', () => {
  it('returns step names', () => {
    const steps = getSetupSteps();
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toBe('Welcome');
  });
});

describe('guided setup flow', () => {
  it('creates initial progress at step 0', () => {
    const progress = createInitialSetupProgress();
    expect(progress.currentStep).toBe(0);
    expect(progress.isComplete).toBe(false);
    expect(progress.selectedTemplate).toBeNull();
  });

  it('advances through steps', () => {
    let progress = createInitialSetupProgress();
    progress = advanceSetupStep(progress);
    expect(progress.currentStep).toBe(1);
    expect(progress.isComplete).toBe(false);
  });

  it('marks complete at the last step', () => {
    let progress = createInitialSetupProgress();
    for (let i = 0; i < progress.totalSteps; i++) {
      progress = advanceSetupStep(progress);
    }
    expect(progress.isComplete).toBe(true);
  });

  it('goes back a step', () => {
    let progress = createInitialSetupProgress();
    progress = advanceSetupStep(progress);
    progress = advanceSetupStep(progress);
    progress = goBackSetupStep(progress);
    expect(progress.currentStep).toBe(1);
  });

  it('does not go below step 0', () => {
    let progress = createInitialSetupProgress();
    progress = goBackSetupStep(progress);
    expect(progress.currentStep).toBe(0);
  });

  it('selects a template', () => {
    let progress = createInitialSetupProgress();
    progress = selectTemplate(progress, 'family');
    expect(progress.selectedTemplate).toBe('family');
    expect(progress.adjustedAllocations).toEqual({});
  });

  it('adjusts allocations', () => {
    let progress = createInitialSetupProgress();
    progress = adjustAllocation(progress, 'Housing', 150_000);
    expect(progress.adjustedAllocations['Housing']).toBe(150_000);
  });

  it('clamps negative allocations to 0', () => {
    let progress = createInitialSetupProgress();
    progress = adjustAllocation(progress, 'Housing', -500);
    expect(progress.adjustedAllocations['Housing']).toBe(0);
  });

  it('rounds fractional cents', () => {
    let progress = createInitialSetupProgress();
    progress = adjustAllocation(progress, 'Housing', 100_050.7);
    expect(progress.adjustedAllocations['Housing']).toBe(100_051);
  });
});
