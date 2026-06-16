// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  calculateStarterTemplateTotal,
  getAvailableBudgetStarterTemplates,
  getBudgetStarterTemplateById,
  getBudgetStarterTemplates,
  getStarterTemplateGuidance,
} from './starter-budget-templates';

describe('starter budget templates', () => {
  it('includes a student starter template with the expected categories and totals', () => {
    const studentTemplate = getBudgetStarterTemplateById('student');

    expect(studentTemplate).not.toBeNull();
    expect(studentTemplate?.isAvailable).toBe(true);
    expect(studentTemplate?.categories.map((category) => category.name)).toEqual([
      'Rent/Housing',
      'Food & Groceries',
      'Textbooks & Supplies',
      'Transportation',
      'Phone & Subscriptions',
      'Going Out & Entertainment',
      'Clothing',
      'Health & Wellness',
      'Savings',
    ]);
    expect(calculateStarterTemplateTotal('student')).toBe(152_500);
  });

  it('includes a Food & Meals template with tracked subcategories', () => {
    const foodMealsTemplate = getBudgetStarterTemplateById('food-meals');

    expect(foodMealsTemplate).not.toBeNull();
    expect(foodMealsTemplate?.isAvailable).toBe(true);
    expect(foodMealsTemplate?.categories.map((category) => category.name)).toEqual([
      'Food & Meals',
      'Groceries',
      'Dining Out',
      'Delivery & Takeout',
      'Coffee & Snacks',
      'Meal Prep',
    ]);
    expect(
      foodMealsTemplate?.categories.filter((category) => category.createBudget === false),
    ).toHaveLength(5);
    expect(calculateStarterTemplateTotal('food-meals')).toBe(70_000);
  });

  it('keeps future starter templates visible but unavailable', () => {
    const templateIds = getBudgetStarterTemplates().map((template) => template.id);

    expect(templateIds).toEqual(['student', 'food-meals', 'professional', 'family', 'retiree']);
    expect(getAvailableBudgetStarterTemplates().map((template) => template.id)).toEqual([
      'student',
      'food-meals',
    ]);
  });

  it('shares the student income guidance copy', () => {
    expect(getStarterTemplateGuidance()).toBe(
      "Adjust these based on your income - we'll help you track what's realistic",
    );
  });
});
