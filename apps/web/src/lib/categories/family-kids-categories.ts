// SPDX-License-Identifier: BUSL-1.1

/**
 * Kid- and family-focused starter category preset.
 *
 * Provides a deterministic set of top-level expense categories that reflect
 * the real costs of raising children — school fees, childcare/daycare,
 * kids' activities & sports, birthdays & gifts, field trips & school
 * supplies, kids' clothing, and medical co-pays. The preset is pure data
 * plus a small, idempotent applier that seeds only the categories that are
 * still missing.
 *
 * All operations are pure: inputs are never mutated, and applying the preset
 * more than once never creates duplicate categories.
 *
 * References: issue #2201
 */

/** A single category definition in the family/kids preset. */
export interface FamilyKidsCategoryDefinition {
  /** Display name shown to the user. */
  readonly name: string;
  /** Emoji icon (rendered directly as a custom category icon). */
  readonly icon: string;
  /** Accent color token used by the category card. */
  readonly color: string;
  /** Short, supportive description of what the category covers. */
  readonly description: string;
}

/**
 * The kid/family starter categories.
 *
 * Ordered roughly from largest, most predictable family costs to smaller,
 * occasional ones so the preview reads naturally for a busy parent.
 */
export const FAMILY_KIDS_CATEGORY_DEFINITIONS: readonly FamilyKidsCategoryDefinition[] = [
  {
    name: 'School Fees',
    icon: '🎒',
    color: '#F59E0B',
    description: 'Tuition, registration, lunch accounts, and recurring school costs.',
  },
  {
    name: 'Childcare & Daycare',
    icon: '🧸',
    color: '#EC4899',
    description: 'Daycare, babysitting, nannies, and after-school care.',
  },
  {
    name: "Kids' Activities & Sports",
    icon: '⚽',
    color: '#2563EB',
    description: 'Sports leagues, lessons, clubs, and hobbies.',
  },
  {
    name: 'Birthdays & Gifts',
    icon: '🎂',
    color: '#DB2777',
    description: 'Parties, presents, and celebrations for kids and their friends.',
  },
  {
    name: 'Field Trips & School Supplies',
    icon: '🚌',
    color: '#0EA5E9',
    description: 'Field trips, classroom supplies, books, and project materials.',
  },
  {
    name: "Kids' Clothing",
    icon: '👕',
    color: '#8B5CF6',
    description: 'Clothes, shoes, and seasonal gear as kids keep growing.',
  },
  {
    name: 'Medical & Co-pays',
    icon: '🩺',
    color: '#059669',
    description: 'Doctor visits, prescriptions, dental, and insurance co-pays.',
  },
] as const;

/**
 * Minimal structural shape used by the preset logic.
 *
 * Keeping this loose (rather than depending on the full KMP `Category` type)
 * keeps the module pure and trivially testable while remaining compatible
 * with the real category records returned by the repository layer.
 */
export interface FamilyKidsCategoryLike {
  readonly name: string;
  readonly isIncome?: boolean;
  readonly householdId?: string;
  readonly sortOrder?: number;
}

/** A computed diff between the preset and the user's existing categories. */
export interface FamilyKidsCategoryPlan {
  /** Every definition in the preset. */
  readonly definitions: readonly FamilyKidsCategoryDefinition[];
  /** Definitions that already exist as an expense category (by name). */
  readonly present: readonly FamilyKidsCategoryDefinition[];
  /** Definitions that are not present yet and would be created. */
  readonly missing: readonly FamilyKidsCategoryDefinition[];
  /** True when every preset category already exists. */
  readonly isComplete: boolean;
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

function nextSortOrder(categories: readonly FamilyKidsCategoryLike[], householdId: string): number {
  return (
    categories
      .filter(
        (category) => category.householdId === undefined || category.householdId === householdId,
      )
      .reduce((max, category) => Math.max(max, category.sortOrder ?? 0), 0) + 1
  );
}

/**
 * Compute which preset categories already exist and which are still missing.
 *
 * Matching is case-insensitive and ignores income categories so a same-named
 * income category never masks a missing expense category.
 *
 * @param categories - The user's current categories.
 * @returns A deterministic plan describing present and missing categories.
 */
export function buildFamilyKidsCategoryPlan(
  categories: readonly FamilyKidsCategoryLike[],
): FamilyKidsCategoryPlan {
  const existingExpenseNames = new Set(
    categories
      .filter((category) => !category.isIncome)
      .map((category) => normalizeCategoryName(category.name)),
  );

  const present: FamilyKidsCategoryDefinition[] = [];
  const missing: FamilyKidsCategoryDefinition[] = [];

  for (const definition of FAMILY_KIDS_CATEGORY_DEFINITIONS) {
    if (existingExpenseNames.has(normalizeCategoryName(definition.name))) {
      present.push(definition);
    } else {
      missing.push(definition);
    }
  }

  return {
    definitions: FAMILY_KIDS_CATEGORY_DEFINITIONS,
    present,
    missing,
    isComplete: missing.length === 0,
  };
}

/** Input passed to the family/kids category applier. */
export interface ApplyFamilyKidsCategoriesOptions<TCategory extends FamilyKidsCategoryLike> {
  /** The user's current categories. */
  readonly categories: readonly TCategory[];
  /** Household the new categories belong to. */
  readonly householdId: string;
  /** Creates a category record; returns the created record or `null` on failure. */
  readonly createCategory: (input: {
    readonly householdId: string;
    readonly name: string;
    readonly icon: string;
    readonly color: string;
    readonly sortOrder: number;
  }) => TCategory | null | Promise<TCategory | null>;
}

/** Result of applying the family/kids preset. */
export interface ApplyFamilyKidsCategoriesResult<TCategory extends FamilyKidsCategoryLike> {
  /** Categories that were created during this apply. */
  readonly created: readonly TCategory[];
  /** Number of categories created. */
  readonly createdCount: number;
  /** Number of preset categories skipped because they already existed. */
  readonly skippedCount: number;
}

/**
 * Seed the missing family/kids categories.
 *
 * Idempotent: only categories absent from {@link buildFamilyKidsCategoryPlan}
 * are created, so applying the preset twice never produces duplicates. The
 * `createCategory` callback is injected so the applier stays pure and can be
 * unit-tested without a database.
 *
 * @param options - Existing categories, household id, and a create callback.
 * @returns A promise resolving to a summary of what was created and skipped.
 */
export async function applyFamilyKidsCategories<TCategory extends FamilyKidsCategoryLike>({
  categories,
  householdId,
  createCategory,
}: ApplyFamilyKidsCategoriesOptions<TCategory>): Promise<
  ApplyFamilyKidsCategoriesResult<TCategory>
> {
  const plan = buildFamilyKidsCategoryPlan(categories);
  const created: TCategory[] = [];
  let sortOrder = nextSortOrder(categories, householdId);

  for (const definition of plan.missing) {
    const record = await createCategory({
      householdId,
      name: definition.name,
      icon: definition.icon,
      color: definition.color,
      sortOrder,
    });

    if (record) {
      created.push(record);
      sortOrder += 1;
    }
  }

  return {
    created,
    createdCount: created.length,
    skippedCount: plan.present.length,
  };
}
