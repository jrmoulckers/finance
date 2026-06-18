// SPDX-License-Identifier: BUSL-1.1

import {
  buildFirstBudgetReview,
  normalizeFirstBudgetDraft,
  type FirstBudgetDraft,
  type FirstBudgetEstimate,
} from '../onboarding/first-budget-tutorial';

export interface FirstBudgetRecordPreviewOptions {
  readonly householdId: string;
  readonly startDate: string;
  readonly currency?: string;
  readonly existingCategoryNames?: readonly string[];
}

export interface FirstBudgetCategoryRecordPreview {
  readonly clientId: string;
  readonly householdId: string;
  readonly name: string;
  readonly kind: FirstBudgetEstimate['kind'];
  readonly isIncome: boolean;
}

export interface FirstBudgetBudgetRecordPreview {
  readonly clientId: string;
  readonly categoryClientId: string;
  readonly householdId: string;
  readonly name: string;
  readonly amountCents: number;
  readonly period: 'MONTHLY';
  readonly startDate: string;
  readonly currency: string;
}

export interface FirstBudgetRecordPreview {
  readonly canCreate: boolean;
  readonly categories: readonly FirstBudgetCategoryRecordPreview[];
  readonly budgets: readonly FirstBudgetBudgetRecordPreview[];
  readonly warnings: readonly string[];
}

export interface FirstBudgetRollbackPlan {
  readonly budgetClientIds: readonly string[];
  readonly categoryClientIds: readonly string[];
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function keyName(value: string): string {
  return normalizeName(value).toLowerCase();
}

export function previewFirstBudgetRecords(
  draft: FirstBudgetDraft,
  options: FirstBudgetRecordPreviewOptions,
): FirstBudgetRecordPreview {
  const current = normalizeFirstBudgetDraft(draft);
  const review = buildFirstBudgetReview(current);
  const existingNames = new Set((options.existingCategoryNames ?? []).map(keyName));
  const warnings = [...review.warnings];
  const seenNames = new Set<string>();
  const currency = (options.currency ?? 'USD').toUpperCase();
  const categories: FirstBudgetCategoryRecordPreview[] = [];
  const budgets: FirstBudgetBudgetRecordPreview[] = [];

  for (const estimate of current.estimates) {
    const name = normalizeName(estimate.label);
    const nameKey = keyName(name);
    if (seenNames.has(nameKey) || existingNames.has(nameKey)) {
      warnings.push(`Skipping duplicate category: ${name}.`);
      continue;
    }
    seenNames.add(nameKey);

    const categoryClientId = `first-budget-category:${estimate.id}`;
    categories.push({
      clientId: categoryClientId,
      householdId: options.householdId,
      name,
      kind: estimate.kind,
      isIncome: estimate.kind === 'income',
    });

    if (estimate.kind !== 'income') {
      budgets.push({
        clientId: `first-budget-budget:${estimate.id}`,
        categoryClientId,
        householdId: options.householdId,
        name,
        amountCents: estimate.amountCents,
        period: 'MONTHLY',
        startDate: options.startDate,
        currency,
      });
    }
  }

  return {
    canCreate: review.canSave && warnings.length === 0,
    categories,
    budgets,
    warnings,
  };
}

export function buildFirstBudgetRollbackPlan(
  preview: FirstBudgetRecordPreview,
): FirstBudgetRollbackPlan {
  return {
    budgetClientIds: preview.budgets.map((budget) => budget.clientId).reverse(),
    categoryClientIds: preview.categories.map((category) => category.clientId).reverse(),
  };
}
