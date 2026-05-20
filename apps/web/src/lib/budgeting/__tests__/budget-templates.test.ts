// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { TemplatePriority } from '../advanced-types';
import type { TemplateAllocation } from '../advanced-types';
import {
  applyTemplate,
  BUILT_IN_TEMPLATES,
  createCustomTemplate,
  getTemplateById,
  TEMPLATE_50_30_20,
  TEMPLATE_80_20,
  TEMPLATE_BARE_BONES,
} from '../budget-templates';

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------

describe('built-in templates', () => {
  it('has three built-in templates', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(3);
  });

  it('50/30/20 percentages sum to 100', () => {
    const sum = TEMPLATE_50_30_20.allocations.reduce((s, a) => s + a.percentOfIncome, 0);
    expect(sum).toBe(100);
  });

  it('80/20 percentages sum to 100', () => {
    const sum = TEMPLATE_80_20.allocations.reduce((s, a) => s + a.percentOfIncome, 0);
    expect(sum).toBe(100);
  });

  it('bare-bones percentages sum to 100', () => {
    const sum = TEMPLATE_BARE_BONES.allocations.reduce((s, a) => s + a.percentOfIncome, 0);
    expect(sum).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// applyTemplate
// ---------------------------------------------------------------------------

describe('applyTemplate', () => {
  it('applies 50/30/20 to $5,000 income', () => {
    const result = applyTemplate(TEMPLATE_50_30_20, 500_000);

    expect(result.templateId).toBe('50-30-20');
    expect(result.incomeCents).toBe(500_000);

    const needs = result.allocations.find((a) => a.categoryName === 'Needs')!;
    expect(needs.amountCents).toBe(250_000);

    const wants = result.allocations.find((a) => a.categoryName === 'Wants')!;
    expect(wants.amountCents).toBe(150_000);

    const savings = result.allocations.find((a) => a.categoryName === 'Savings')!;
    expect(savings.amountCents).toBe(100_000);

    expect(result.remainderCents).toBe(0);
  });

  it('handles zero income', () => {
    const result = applyTemplate(TEMPLATE_50_30_20, 0);
    expect(result.allocations.every((a) => a.amountCents === 0)).toBe(true);
    expect(result.remainderCents).toBe(0);
  });

  it('tracks rounding remainder', () => {
    // 333 cents: 50% = 166.5 → banker's rounds to 166, 30% = 99.9 → 100, 20% = 66.6 → 67
    const result = applyTemplate(TEMPLATE_50_30_20, 333);
    const totalAllocated = result.allocations.reduce((s, a) => s + a.amountCents, 0);
    expect(result.remainderCents).toBe(333 - totalAllocated);
  });

  it('throws on negative income', () => {
    expect(() => applyTemplate(TEMPLATE_50_30_20, -100)).toThrow('non-negative');
  });

  it('applies to large income without overflow', () => {
    const result = applyTemplate(TEMPLATE_50_30_20, 1_000_000_000); // $10M
    const totalAllocated = result.allocations.reduce((s, a) => s + a.amountCents, 0);
    expect(totalAllocated + result.remainderCents).toBe(1_000_000_000);
  });
});

// ---------------------------------------------------------------------------
// createCustomTemplate
// ---------------------------------------------------------------------------

describe('createCustomTemplate', () => {
  it('creates a valid custom template', () => {
    const allocations: TemplateAllocation[] = [
      { categoryName: 'Essentials', percentOfIncome: 60, priority: TemplatePriority.NEEDS },
      { categoryName: 'Fun', percentOfIncome: 20, priority: TemplatePriority.WANTS },
      { categoryName: 'Save', percentOfIncome: 20, priority: TemplatePriority.SAVINGS },
    ];

    const template = createCustomTemplate('custom-1', 'My Budget', 'Custom desc', allocations);

    expect(template.id).toBe('custom-1');
    expect(template.allocations).toHaveLength(3);
  });

  it('throws when percentages do not sum to 100', () => {
    const allocations: TemplateAllocation[] = [
      { categoryName: 'A', percentOfIncome: 50, priority: TemplatePriority.NEEDS },
      { categoryName: 'B', percentOfIncome: 30, priority: TemplatePriority.WANTS },
    ];

    expect(() => createCustomTemplate('x', 'X', 'X', allocations)).toThrow('sum to 100');
  });

  it('throws when any percentage is negative', () => {
    const allocations: TemplateAllocation[] = [
      { categoryName: 'A', percentOfIncome: -10, priority: TemplatePriority.NEEDS },
      { categoryName: 'B', percentOfIncome: 110, priority: TemplatePriority.WANTS },
    ];

    expect(() => createCustomTemplate('x', 'X', 'X', allocations)).toThrow('non-negative');
  });
});

// ---------------------------------------------------------------------------
// getTemplateById
// ---------------------------------------------------------------------------

describe('getTemplateById', () => {
  it('finds 50-30-20 template', () => {
    expect(getTemplateById('50-30-20')).toBeDefined();
    expect(getTemplateById('50-30-20')!.name).toBe('50/30/20 Rule');
  });

  it('returns undefined for unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });
});
