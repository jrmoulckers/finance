// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import {
  applyFamilyKidsCategories,
  buildFamilyKidsCategoryPlan,
  FAMILY_KIDS_CATEGORY_DEFINITIONS,
  type FamilyKidsCategoryLike,
} from './family-kids-categories';

interface TestCategory extends FamilyKidsCategoryLike {
  readonly id: string;
  readonly name: string;
  readonly isIncome?: boolean;
  readonly householdId?: string;
  readonly sortOrder?: number;
  readonly icon?: string;
  readonly color?: string;
}

function makeCreateCategory() {
  let counter = 0;
  return vi.fn(
    (input: {
      householdId: string;
      name: string;
      icon: string;
      color: string;
      sortOrder: number;
    }): TestCategory => {
      counter += 1;
      return {
        id: `created-${counter}`,
        householdId: input.householdId,
        name: input.name,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
        isIncome: false,
      };
    },
  );
}

describe('FAMILY_KIDS_CATEGORY_DEFINITIONS', () => {
  it('covers the kid-specific family expenses for this persona', () => {
    const names = FAMILY_KIDS_CATEGORY_DEFINITIONS.map((definition) => definition.name);

    expect(names).toEqual([
      'School Fees',
      'Childcare & Daycare',
      "Kids' Activities & Sports",
      'Birthdays & Gifts',
      'Field Trips & School Supplies',
      "Kids' Clothing",
      'Medical & Co-pays',
    ]);
  });

  it('gives every category an icon, color, and supportive description', () => {
    for (const definition of FAMILY_KIDS_CATEGORY_DEFINITIONS) {
      expect(definition.icon.length).toBeGreaterThan(0);
      expect(definition.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(definition.description.length).toBeGreaterThan(0);
    }
  });
});

describe('buildFamilyKidsCategoryPlan', () => {
  it('marks every category as missing when none exist', () => {
    const plan = buildFamilyKidsCategoryPlan([]);

    expect(plan.present).toHaveLength(0);
    expect(plan.missing).toHaveLength(FAMILY_KIDS_CATEGORY_DEFINITIONS.length);
    expect(plan.isComplete).toBe(false);
  });

  it('detects existing categories case-insensitively and ignores whitespace', () => {
    const categories: TestCategory[] = [
      { id: 'a', name: '  school fees  ' },
      { id: 'b', name: "KIDS' CLOTHING" },
    ];

    const plan = buildFamilyKidsCategoryPlan(categories);

    expect(plan.present.map((definition) => definition.name)).toEqual([
      'School Fees',
      "Kids' Clothing",
    ]);
    expect(plan.missing.map((definition) => definition.name)).not.toContain('School Fees');
    expect(plan.isComplete).toBe(false);
  });

  it('does not let an income category mask a missing expense category', () => {
    const categories: TestCategory[] = [{ id: 'a', name: 'School Fees', isIncome: true }];

    const plan = buildFamilyKidsCategoryPlan(categories);

    expect(plan.missing.map((definition) => definition.name)).toContain('School Fees');
    expect(plan.present).toHaveLength(0);
  });

  it('reports completion once all preset categories exist', () => {
    const categories: TestCategory[] = FAMILY_KIDS_CATEGORY_DEFINITIONS.map(
      (definition, index) => ({
        id: `c-${index}`,
        name: definition.name,
      }),
    );

    const plan = buildFamilyKidsCategoryPlan(categories);

    expect(plan.missing).toHaveLength(0);
    expect(plan.isComplete).toBe(true);
  });
});

describe('applyFamilyKidsCategories', () => {
  it('creates every missing category exactly once', () => {
    const createCategory = makeCreateCategory();

    const result = applyFamilyKidsCategories<TestCategory>({
      categories: [],
      householdId: 'household-1',
      createCategory,
    });

    expect(result.createdCount).toBe(FAMILY_KIDS_CATEGORY_DEFINITIONS.length);
    expect(result.skippedCount).toBe(0);
    expect(createCategory).toHaveBeenCalledTimes(FAMILY_KIDS_CATEGORY_DEFINITIONS.length);
    expect(result.created.map((category) => category.name)).toEqual(
      FAMILY_KIDS_CATEGORY_DEFINITIONS.map((definition) => definition.name),
    );
  });

  it('assigns increasing sort orders above existing categories', () => {
    const createCategory = makeCreateCategory();
    const categories: TestCategory[] = [
      { id: 'existing', name: 'Rent', householdId: 'household-1', sortOrder: 7 },
    ];

    const result = applyFamilyKidsCategories<TestCategory>({
      categories,
      householdId: 'household-1',
      createCategory,
    });

    const sortOrders = result.created.map((category) => category.sortOrder);
    expect(sortOrders[0]).toBe(8);
    expect(sortOrders).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });

  it('is idempotent — a second apply creates nothing new', () => {
    const firstCreate = makeCreateCategory();
    const seeded = applyFamilyKidsCategories<TestCategory>({
      categories: [],
      householdId: 'household-1',
      createCategory: firstCreate,
    });

    const secondCreate = makeCreateCategory();
    const result = applyFamilyKidsCategories<TestCategory>({
      categories: seeded.created,
      householdId: 'household-1',
      createCategory: secondCreate,
    });

    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(FAMILY_KIDS_CATEGORY_DEFINITIONS.length);
    expect(secondCreate).not.toHaveBeenCalled();
  });

  it('only seeds the categories that are still missing', () => {
    const createCategory = makeCreateCategory();
    const categories: TestCategory[] = [
      { id: 'a', name: 'School Fees', householdId: 'household-1', sortOrder: 1 },
      { id: 'b', name: 'Birthdays & Gifts', householdId: 'household-1', sortOrder: 2 },
    ];

    const result = applyFamilyKidsCategories<TestCategory>({
      categories,
      householdId: 'household-1',
      createCategory,
    });

    expect(result.skippedCount).toBe(2);
    expect(result.createdCount).toBe(FAMILY_KIDS_CATEGORY_DEFINITIONS.length - 2);
    expect(result.created.map((category) => category.name)).not.toContain('School Fees');
    expect(result.created.map((category) => category.name)).not.toContain('Birthdays & Gifts');
  });

  it('skips records the create callback fails to persist', () => {
    const createCategory = vi.fn(() => null);

    const result = applyFamilyKidsCategories<TestCategory>({
      categories: [],
      householdId: 'household-1',
      createCategory,
    });

    expect(result.createdCount).toBe(0);
    expect(result.created).toHaveLength(0);
  });

  it('does not mutate the input categories array', () => {
    const createCategory = makeCreateCategory();
    const categories: TestCategory[] = [{ id: 'a', name: 'Rent' }];

    applyFamilyKidsCategories<TestCategory>({
      categories,
      householdId: 'household-1',
      createCategory,
    });

    expect(categories).toHaveLength(1);
  });
});
