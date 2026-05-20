// SPDX-License-Identifier: BUSL-1.1

/**
 * Budget template engine.
 *
 * Provides starter templates (50/30/20, bare-bones, 80/20, custom)
 * and logic to apply a template to a given income amount.
 *
 * All amounts are integer cents. Banker's rounding is used for
 * percentage-to-cents conversion. Remainder from rounding is tracked
 * explicitly so every cent is accounted for.
 *
 * References: #1560
 */

import type {
  BudgetTemplate,
  ComputedTemplateAllocation,
  TemplateAllocation,
  TemplateApplicationResult,
} from './advanced-types';
import { TemplatePriority } from './advanced-types';
import { bankersRound } from './utils';

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------

/** The classic 50/30/20 budget rule. */
export const TEMPLATE_50_30_20: BudgetTemplate = {
  id: '50-30-20',
  name: '50/30/20 Rule',
  description: '50% needs, 30% wants, 20% savings & debt repayment.',
  allocations: [
    { categoryName: 'Needs', percentOfIncome: 50, priority: TemplatePriority.NEEDS },
    { categoryName: 'Wants', percentOfIncome: 30, priority: TemplatePriority.WANTS },
    { categoryName: 'Savings', percentOfIncome: 20, priority: TemplatePriority.SAVINGS },
  ],
};

/** An 80/20 simplified budget. */
export const TEMPLATE_80_20: BudgetTemplate = {
  id: '80-20',
  name: '80/20 Rule',
  description: '80% spending, 20% savings — simple and effective.',
  allocations: [
    { categoryName: 'Spending', percentOfIncome: 80, priority: TemplatePriority.NEEDS },
    { categoryName: 'Savings', percentOfIncome: 20, priority: TemplatePriority.SAVINGS },
  ],
};

/** A bare-bones essentials-only template. */
export const TEMPLATE_BARE_BONES: BudgetTemplate = {
  id: 'bare-bones',
  name: 'Bare Bones',
  description: 'Essentials only — maximize savings during tight months.',
  allocations: [
    { categoryName: 'Housing', percentOfIncome: 30, priority: TemplatePriority.NEEDS },
    { categoryName: 'Food', percentOfIncome: 15, priority: TemplatePriority.NEEDS },
    { categoryName: 'Transport', percentOfIncome: 10, priority: TemplatePriority.NEEDS },
    { categoryName: 'Utilities', percentOfIncome: 10, priority: TemplatePriority.NEEDS },
    { categoryName: 'Insurance', percentOfIncome: 5, priority: TemplatePriority.NEEDS },
    { categoryName: 'Savings', percentOfIncome: 30, priority: TemplatePriority.SAVINGS },
  ],
};

/** All built-in templates. */
export const BUILT_IN_TEMPLATES: readonly BudgetTemplate[] = [
  TEMPLATE_50_30_20,
  TEMPLATE_80_20,
  TEMPLATE_BARE_BONES,
];

// ---------------------------------------------------------------------------
// Template application
// ---------------------------------------------------------------------------

/**
 * Apply a budget template to a given income, computing cent amounts.
 *
 * Uses banker's rounding for each allocation. Any difference between
 * income and the sum of allocations (due to rounding) is captured in
 * `remainderCents`.
 *
 * @param template - The template to apply.
 * @param incomeCents - Total income in cents.
 * @returns A {@link TemplateApplicationResult} with computed allocations.
 * @throws {Error} If incomeCents is negative.
 */
export function applyTemplate(
  template: BudgetTemplate,
  incomeCents: number,
): TemplateApplicationResult {
  if (incomeCents < 0) {
    throw new Error('Income must be non-negative.');
  }

  const allocations: ComputedTemplateAllocation[] = template.allocations.map((a) => ({
    categoryName: a.categoryName,
    amountCents: bankersRound((incomeCents * a.percentOfIncome) / 100),
    percentOfIncome: a.percentOfIncome,
    priority: a.priority,
  }));

  const totalAllocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);

  return {
    templateId: template.id,
    incomeCents,
    allocations,
    remainderCents: incomeCents - totalAllocated,
  };
}

// ---------------------------------------------------------------------------
// Custom template creation
// ---------------------------------------------------------------------------

/**
 * Create a custom budget template from user-defined allocations.
 *
 * Validates that percentages sum to exactly 100 and are all non-negative.
 *
 * @param id - Unique template ID.
 * @param name - Display name.
 * @param description - Description.
 * @param allocations - Category allocation rules.
 * @returns A validated {@link BudgetTemplate}.
 * @throws {Error} If percentages don't sum to 100 or any is negative.
 */
export function createCustomTemplate(
  id: string,
  name: string,
  description: string,
  allocations: readonly TemplateAllocation[],
): BudgetTemplate {
  const totalPercent = allocations.reduce((sum, a) => sum + a.percentOfIncome, 0);

  if (allocations.some((a) => a.percentOfIncome < 0)) {
    throw new Error('All percentages must be non-negative.');
  }

  if (totalPercent !== 100) {
    throw new Error(`Percentages must sum to 100, got ${totalPercent}.`);
  }

  return { id, name, description, allocations: [...allocations] };
}

/**
 * Look up a built-in template by ID.
 *
 * @param templateId - The template ID to find.
 * @returns The matching template or undefined.
 */
export function getTemplateById(templateId: string): BudgetTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
}
