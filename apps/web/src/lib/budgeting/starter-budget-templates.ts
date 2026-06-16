// SPDX-License-Identifier: BUSL-1.1

/**
 * Starter budget templates used by onboarding and manual budget creation.
 *
 * Templates are opinionated starting points only — users can edit created
 * budgets afterwards to better match their real life.
 *
 * References: issue #2148
 */

export type BudgetStarterTemplateId =
  | 'student'
  | 'food-meals'
  | 'professional'
  | 'family'
  | 'retiree';

export interface BudgetStarterTemplateCategory {
  readonly emoji: string;
  readonly name: string;
  readonly amountCents: number;
  readonly icon: string;
  readonly color: string;
  readonly parentName?: string | null;
  readonly createBudget?: boolean;
}

export interface BudgetStarterTemplate {
  readonly id: BudgetStarterTemplateId;
  readonly name: string;
  readonly description: string;
  readonly guidance: string;
  readonly categories: readonly BudgetStarterTemplateCategory[];
  readonly isAvailable: boolean;
  readonly availabilityLabel?: string;
}

const STUDENT_GUIDANCE =
  "Adjust these based on your income - we'll help you track what's realistic";

const STUDENT_TEMPLATE: BudgetStarterTemplate = {
  id: 'student',
  name: 'Student',
  description: 'A realistic monthly starter budget for students with unpredictable income.',
  guidance: STUDENT_GUIDANCE,
  isAvailable: true,
  categories: [
    { emoji: '🏠', name: 'Rent/Housing', amountCents: 80_000, icon: 'home', color: '#7C3AED' },
    {
      emoji: '🍕',
      name: 'Food & Groceries',
      amountCents: 30_000,
      icon: 'utensils',
      color: '#16A34A',
    },
    {
      emoji: '📚',
      name: 'Textbooks & Supplies',
      amountCents: 10_000,
      icon: 'package',
      color: '#F59E0B',
    },
    {
      emoji: '🚌',
      name: 'Transportation',
      amountCents: 7_500,
      icon: 'car',
      color: '#2563EB',
    },
    {
      emoji: '📱',
      name: 'Phone & Subscriptions',
      amountCents: 5_000,
      icon: 'wallet',
      color: '#0EA5E9',
    },
    {
      emoji: '🎉',
      name: 'Going Out & Entertainment',
      amountCents: 10_000,
      icon: 'film',
      color: '#DB2777',
    },
    {
      emoji: '👕',
      name: 'Clothing',
      amountCents: 5_000,
      icon: 'tag',
      color: '#EC4899',
    },
    {
      emoji: '💊',
      name: 'Health & Wellness',
      amountCents: 3_000,
      icon: 'heart-pulse',
      color: '#EF4444',
    },
    {
      emoji: '💰',
      name: 'Savings',
      amountCents: 2_000,
      icon: 'wallet',
      color: '#059669',
    },
  ],
};

const FOOD_MEALS_TEMPLATE: BudgetStarterTemplate = {
  id: 'food-meals',
  name: 'Food & Meals',
  description: 'One food budget with grocery, dining, delivery, coffee, and meal-prep tracking.',
  guidance:
    'Create one monthly food budget, then sort spending into Groceries, Dining Out, Delivery & Takeout, Coffee & Snacks, and Meal Prep.',
  isAvailable: true,
  categories: [
    {
      emoji: '🍽️',
      name: 'Food & Meals',
      amountCents: 70_000,
      icon: 'utensils',
      color: '#16A34A',
    },
    {
      emoji: '🛒',
      name: 'Groceries',
      amountCents: 0,
      icon: '🛒',
      color: '#16A34A',
      parentName: 'Food & Meals',
      createBudget: false,
    },
    {
      emoji: '🍽️',
      name: 'Dining Out',
      amountCents: 0,
      icon: '🍽️',
      color: '#F97316',
      parentName: 'Food & Meals',
      createBudget: false,
    },
    {
      emoji: '🥡',
      name: 'Delivery & Takeout',
      amountCents: 0,
      icon: '🥡',
      color: '#FB7185',
      parentName: 'Food & Meals',
      createBudget: false,
    },
    {
      emoji: '☕',
      name: 'Coffee & Snacks',
      amountCents: 0,
      icon: '☕',
      color: '#A16207',
      parentName: 'Food & Meals',
      createBudget: false,
    },
    {
      emoji: '🥗',
      name: 'Meal Prep',
      amountCents: 0,
      icon: '🥗',
      color: '#0F766E',
      parentName: 'Food & Meals',
      createBudget: false,
    },
  ],
};

const COMING_SOON_TEMPLATES: readonly BudgetStarterTemplate[] = [
  {
    id: 'professional',
    name: 'Professional',
    description: 'Built for early-career budgets with commuting and career growth costs.',
    guidance: 'Coming soon',
    categories: [],
    isAvailable: false,
    availabilityLabel: 'Coming soon',
  },
  {
    id: 'family',
    name: 'Family',
    description: 'Designed for households balancing childcare, groceries, and shared bills.',
    guidance: 'Coming soon',
    categories: [],
    isAvailable: false,
    availabilityLabel: 'Coming soon',
  },
  {
    id: 'retiree',
    name: 'Retiree',
    description: 'Focused on fixed income, healthcare, and flexible leisure spending.',
    guidance: 'Coming soon',
    categories: [],
    isAvailable: false,
    availabilityLabel: 'Coming soon',
  },
] as const;

const STARTER_BUDGET_TEMPLATES: readonly BudgetStarterTemplate[] = [
  STUDENT_TEMPLATE,
  FOOD_MEALS_TEMPLATE,
  ...COMING_SOON_TEMPLATES,
] as const;

export function getBudgetStarterTemplates(): BudgetStarterTemplate[] {
  return STARTER_BUDGET_TEMPLATES.map((template) => ({
    ...template,
    categories: template.categories.map((category) => ({ ...category })),
  }));
}

export function getBudgetStarterTemplateById(
  templateId: BudgetStarterTemplateId,
): BudgetStarterTemplate | null {
  const template = STARTER_BUDGET_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) {
    return null;
  }

  return {
    ...template,
    categories: template.categories.map((category) => ({ ...category })),
  };
}

export function getAvailableBudgetStarterTemplates(): BudgetStarterTemplate[] {
  return getBudgetStarterTemplates().filter((template) => template.isAvailable);
}

export function getStarterTemplateGuidance(): string {
  return STUDENT_GUIDANCE;
}

export function calculateStarterTemplateTotal(templateId: BudgetStarterTemplateId): number {
  const template = getBudgetStarterTemplateById(templateId);
  return template?.categories.reduce((total, category) => total + category.amountCents, 0) ?? 0;
}
