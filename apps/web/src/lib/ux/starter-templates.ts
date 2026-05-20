// SPDX-License-Identifier: BUSL-1.1

/**
 * Starter budget template engine.
 *
 * Provides beginner-friendly budget templates (basic, student, family,
 * single-income) with recommended categories and guided setup flow data.
 * All monetary values are in integer cents.
 *
 * All operations are pure and immutable — inputs are never mutated.
 *
 * References: issue #1718
 */

import type { GuidedSetupProgress, StarterTemplate, TemplateCategory, TemplateId } from './types';

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

/** All available starter budget templates. */
const TEMPLATES: Readonly<Record<TemplateId, StarterTemplate>> = {
  basic: {
    id: 'basic',
    displayName: 'Basic Budget',
    description: 'A simple budget for anyone getting started with financial tracking.',
    suggestedIncomeCents: 350_000,
    totalSuggestedCents: 350_000,
    categories: [
      { name: 'Housing', suggestedCents: 105_000, isEssential: true },
      { name: 'Food & Groceries', suggestedCents: 52_500, isEssential: true },
      { name: 'Transportation', suggestedCents: 35_000, isEssential: true },
      { name: 'Utilities', suggestedCents: 21_000, isEssential: true },
      { name: 'Insurance', suggestedCents: 17_500, isEssential: true },
      { name: 'Savings', suggestedCents: 35_000, isEssential: false },
      { name: 'Entertainment', suggestedCents: 24_500, isEssential: false },
      { name: 'Personal Care', suggestedCents: 17_500, isEssential: false },
      { name: 'Miscellaneous', suggestedCents: 42_000, isEssential: false },
    ],
  },
  student: {
    id: 'student',
    displayName: 'Student Budget',
    description: 'Designed for students managing limited income and education expenses.',
    suggestedIncomeCents: 150_000,
    totalSuggestedCents: 150_000,
    categories: [
      { name: 'Rent', suggestedCents: 52_500, isEssential: true },
      { name: 'Food & Groceries', suggestedCents: 30_000, isEssential: true },
      { name: 'Textbooks & Supplies', suggestedCents: 7_500, isEssential: true },
      { name: 'Transportation', suggestedCents: 12_000, isEssential: true },
      { name: 'Phone & Internet', suggestedCents: 7_500, isEssential: true },
      { name: 'Savings', suggestedCents: 15_000, isEssential: false },
      { name: 'Entertainment', suggestedCents: 12_000, isEssential: false },
      { name: 'Personal Care', suggestedCents: 6_000, isEssential: false },
      { name: 'Miscellaneous', suggestedCents: 7_500, isEssential: false },
    ],
  },
  family: {
    id: 'family',
    displayName: 'Family Budget',
    description: 'For households with children, covering childcare, education, and family needs.',
    suggestedIncomeCents: 600_000,
    totalSuggestedCents: 600_000,
    categories: [
      { name: 'Housing', suggestedCents: 180_000, isEssential: true },
      { name: 'Food & Groceries', suggestedCents: 90_000, isEssential: true },
      { name: 'Childcare & Education', suggestedCents: 72_000, isEssential: true },
      { name: 'Transportation', suggestedCents: 48_000, isEssential: true },
      { name: 'Utilities', suggestedCents: 30_000, isEssential: true },
      { name: 'Insurance', suggestedCents: 36_000, isEssential: true },
      { name: 'Healthcare', suggestedCents: 24_000, isEssential: true },
      { name: 'Savings', suggestedCents: 60_000, isEssential: false },
      { name: 'Entertainment', suggestedCents: 30_000, isEssential: false },
      { name: 'Clothing', suggestedCents: 18_000, isEssential: false },
      { name: 'Miscellaneous', suggestedCents: 12_000, isEssential: false },
    ],
  },
  'single-income': {
    id: 'single-income',
    displayName: 'Single Income Budget',
    description: 'Optimised for households with one income earner, focusing on essentials first.',
    suggestedIncomeCents: 400_000,
    totalSuggestedCents: 400_000,
    categories: [
      { name: 'Housing', suggestedCents: 120_000, isEssential: true },
      { name: 'Food & Groceries', suggestedCents: 60_000, isEssential: true },
      { name: 'Transportation', suggestedCents: 40_000, isEssential: true },
      { name: 'Utilities', suggestedCents: 28_000, isEssential: true },
      { name: 'Insurance', suggestedCents: 24_000, isEssential: true },
      { name: 'Healthcare', suggestedCents: 16_000, isEssential: true },
      { name: 'Debt Payments', suggestedCents: 32_000, isEssential: true },
      { name: 'Savings', suggestedCents: 40_000, isEssential: false },
      { name: 'Entertainment', suggestedCents: 20_000, isEssential: false },
      { name: 'Miscellaneous', suggestedCents: 20_000, isEssential: false },
    ],
  },
};

/** Steps in the guided setup flow. */
const SETUP_STEPS = [
  'Welcome',
  'Choose Template',
  'Review Categories',
  'Adjust Allocations',
  'Set Income',
  'Confirm & Create',
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all available starter templates.
 *
 * @returns Array of all starter templates.
 */
export function getAllTemplates(): StarterTemplate[] {
  return Object.values(TEMPLATES);
}

/**
 * Get a specific template by its identifier.
 *
 * @param id - Template identifier.
 * @returns The matching template, or `null` if not found.
 */
export function getTemplateById(id: TemplateId): StarterTemplate | null {
  return TEMPLATES[id] ?? null;
}

/**
 * Get only the essential categories from a template.
 *
 * @param id - Template identifier.
 * @returns Array of essential categories, or empty if template not found.
 */
export function getEssentialCategories(id: TemplateId): TemplateCategory[] {
  const template = TEMPLATES[id];
  if (!template) return [];
  return template.categories.filter((c) => c.isEssential);
}

/**
 * Calculate the total suggested allocation for a template.
 *
 * @param categories - Categories to total.
 * @returns Sum of all `suggestedCents` values.
 */
export function calculateTotalAllocation(categories: readonly TemplateCategory[]): number {
  return categories.reduce((sum, c) => sum + c.suggestedCents, 0);
}

/**
 * Scale a template's category allocations to match a target income.
 *
 * Preserves relative proportions. All values are rounded to whole cents.
 *
 * @param template    - The source template.
 * @param incomeCents - The user's actual monthly income in cents.
 * @returns Array of categories with scaled allocations.
 */
export function scaleTemplateTo(
  template: StarterTemplate,
  incomeCents: number,
): TemplateCategory[] {
  if (template.totalSuggestedCents === 0 || incomeCents <= 0) {
    return template.categories.map((c) => ({ ...c, suggestedCents: 0 }));
  }

  const ratio = incomeCents / template.totalSuggestedCents;
  return template.categories.map((c) => ({
    ...c,
    suggestedCents: Math.round(c.suggestedCents * ratio),
  }));
}

// ---------------------------------------------------------------------------
// Guided setup flow
// ---------------------------------------------------------------------------

/**
 * Get the names of all guided setup steps.
 *
 * @returns Array of step names.
 */
export function getSetupSteps(): readonly string[] {
  return SETUP_STEPS;
}

/**
 * Create the initial guided setup progress state.
 *
 * @returns A fresh setup progress object at step 0.
 */
export function createInitialSetupProgress(): GuidedSetupProgress {
  return {
    currentStep: 0,
    totalSteps: SETUP_STEPS.length,
    isComplete: false,
    selectedTemplate: null,
    adjustedAllocations: {},
  };
}

/**
 * Advance to the next step in the guided setup flow.
 *
 * Does nothing if already at the final step.
 *
 * @param progress - Current setup progress.
 * @returns Updated progress with incremented step.
 */
export function advanceSetupStep(progress: GuidedSetupProgress): GuidedSetupProgress {
  if (progress.currentStep >= progress.totalSteps - 1) {
    return { ...progress, isComplete: true };
  }
  return { ...progress, currentStep: progress.currentStep + 1 };
}

/**
 * Go back to the previous step in the guided setup flow.
 *
 * Does nothing if already at step 0.
 *
 * @param progress - Current setup progress.
 * @returns Updated progress with decremented step.
 */
export function goBackSetupStep(progress: GuidedSetupProgress): GuidedSetupProgress {
  if (progress.currentStep <= 0) return progress;
  return { ...progress, currentStep: progress.currentStep - 1, isComplete: false };
}

/**
 * Select a template in the guided setup flow.
 *
 * @param progress   - Current setup progress.
 * @param templateId - The template to select.
 * @returns Updated progress with the template selected.
 */
export function selectTemplate(
  progress: GuidedSetupProgress,
  templateId: TemplateId,
): GuidedSetupProgress {
  return { ...progress, selectedTemplate: templateId, adjustedAllocations: {} };
}

/**
 * Adjust a category allocation in the guided setup flow.
 *
 * @param progress     - Current setup progress.
 * @param categoryName - Name of the category to adjust.
 * @param amountCents  - New allocation amount in cents.
 * @returns Updated progress with the adjusted allocation.
 */
export function adjustAllocation(
  progress: GuidedSetupProgress,
  categoryName: string,
  amountCents: number,
): GuidedSetupProgress {
  return {
    ...progress,
    adjustedAllocations: {
      ...progress.adjustedAllocations,
      [categoryName]: Math.max(0, Math.round(amountCents)),
    },
  };
}
