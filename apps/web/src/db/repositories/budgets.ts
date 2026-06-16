// SPDX-License-Identifier: BUSL-1.1

import type { Budget, BudgetPeriod, Category, Currency, SyncId } from '../../kmp/bridge';
import { Currencies, cents } from '../../kmp/bridge';
import {
  getBudgetStarterTemplateById,
  type BudgetStarterTemplateCategory,
  type BudgetStarterTemplateId,
} from '../../lib/budgeting/starter-budget-templates';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import { createCategory, getAllCategories } from './categories';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  requireString,
  toBoolean,
} from './helpers';

const BUDGET_COLUMNS = [
  'id',
  'household_id',
  'category_id',
  'name',
  'amount',
  'currency',
  'period',
  'start_date',
  'end_date',
  'is_rollover',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const BUDGET_BASE_QUERY = `SELECT ${BUDGET_COLUMNS} FROM budget WHERE deleted_at IS NULL`;

/** Input used when creating a new budget record. */
export interface CreateBudgetInput {
  householdId: SyncId;
  categoryId: SyncId;
  name: string;
  amount: { amount: number };
  currency?: Currency;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string | null;
  isRollover?: boolean;
}

/** Input used when updating an existing budget record. */
export interface UpdateBudgetInput {
  householdId?: SyncId;
  categoryId?: SyncId;
  name?: string;
  amount?: { amount: number };
  currency?: Currency;
  period?: BudgetPeriod;
  startDate?: string;
  endDate?: string | null;
  isRollover?: boolean;
}

/** Budget shape enriched with calculated spending totals. */
export interface BudgetWithSpending extends Budget {
  readonly spentAmount: { amount: number };
  readonly remainingAmount: { amount: number };
}

/** Breakdown of spending within a budget's category tree. */
export interface BudgetSpendingBreakdownItem {
  readonly categoryId: SyncId;
  readonly categoryName: string;
  readonly spentAmount: { amount: number };
}

/** Input used when creating a starter budget template. */
export interface CreateBudgetTemplateInput {
  templateId: BudgetStarterTemplateId;
  startDate: string;
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

function findFirstHouseholdId(db: SqliteDb): SyncId | null {
  const row = queryOne<Row>(
    db,
    'SELECT id FROM household WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  );
  return row ? requireString(row.id, 'household.id') : null;
}

function resolveTemplateHouseholdId(db: SqliteDb, categories: Category[]): SyncId {
  const existingHouseholdId =
    categories.find((category) => category.isIncome === false)?.householdId ??
    categories[0]?.householdId;

  if (existingHouseholdId) {
    return existingHouseholdId;
  }

  const householdId = findFirstHouseholdId(db);
  if (!householdId) {
    throw new Error('Cannot create a starter budget without a household.');
  }

  return householdId;
}

function findMatchingTemplateCategory(
  categories: Category[],
  householdId: SyncId,
  name: string,
  parentId: SyncId | null = null,
): Category | null {
  const normalizedName = normalizeCategoryName(name);
  return (
    categories.find(
      (category) =>
        category.householdId === householdId &&
        category.parentId === parentId &&
        normalizeCategoryName(category.name) === normalizedName &&
        category.isIncome === false,
    ) ?? null
  );
}

function ensureTemplateCategory(
  db: SqliteDb,
  categories: Category[],
  householdId: SyncId,
  templateCategory: BudgetStarterTemplateCategory,
  parentId: SyncId | null = null,
): Category {
  const existingCategory = findMatchingTemplateCategory(
    categories,
    householdId,
    templateCategory.name,
    parentId,
  );
  if (existingCategory) {
    return existingCategory;
  }

  const sortOrder =
    categories
      .filter((category) => category.householdId === householdId)
      .reduce((maxSortOrder, category) => Math.max(maxSortOrder, category.sortOrder), 0) + 1;

  const createdCategory = createCategory(db, {
    householdId,
    name: templateCategory.name,
    icon: templateCategory.icon,
    color: templateCategory.color,
    parentId,
    sortOrder,
  });

  categories.push(createdCategory);
  return createdCategory;
}

function buildBudgetCategoryScopeCte(): string {
  return `WITH RECURSIVE budget_category_scope(id) AS (
    SELECT category_id
      FROM budget
     WHERE id = ?
       AND deleted_at IS NULL
    UNION ALL
    SELECT c.id
      FROM category c
      JOIN budget_category_scope scope
        ON c.parent_id = scope.id
     WHERE c.deleted_at IS NULL
  )`;
}

const TRANSACTION_CATEGORY_AMOUNTS_CTE = `,
transaction_category_amounts AS (
  SELECT tx.household_id AS household_id,
         tx.date AS date,
         tx.type AS type,
         CASE
           WHEN split.value IS NULL THEN tx.category_id
           ELSE json_extract(split.value, '$.categoryId')
         END AS category_id,
         CASE
           WHEN split.value IS NULL THEN tx.amount
           ELSE CAST(json_extract(split.value, '$.amount') AS INTEGER)
         END AS amount
    FROM "transaction" tx
    LEFT JOIN json_each(COALESCE(NULLIF(tx.splits, ''), '[]')) AS split
   WHERE tx.deleted_at IS NULL
)`;

function mapBudget(row: Row): Budget {
  return {
    id: requireString(row.id, 'budget.id'),
    householdId: requireString(row.household_id, 'budget.household_id'),
    categoryId: requireString(row.category_id, 'budget.category_id'),
    name: requireString(row.name, 'budget.name'),
    amount: mapCents(row.amount, 'budget.amount'),
    currency: mapCurrency(row.currency),
    period: requireString(row.period, 'budget.period') as BudgetPeriod,
    startDate: requireString(row.start_date, 'budget.start_date'),
    endDate: optionalString(row.end_date),
    isRollover: toBoolean(row.is_rollover),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted budgets ordered by period start date. */
export function getAllBudgets(db: SqliteDb): Budget[] {
  return query<Row>(db, `${BUDGET_BASE_QUERY} ORDER BY start_date DESC, name ASC`).rows.map(
    mapBudget,
  );
}

/** Find a single non-deleted budget by its identifier. */
export function getBudgetById(db: SqliteDb, budgetId: SyncId): Budget | null {
  const row = queryOne<Row>(db, `${BUDGET_BASE_QUERY} AND id = ?`, [budgetId]);
  return row ? mapBudget(row) : null;
}

/** Insert a new budget row and return the created budget. */
export function createBudget(db: SqliteDb, input: CreateBudgetInput): Budget {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;

  execute(
    db,
    `INSERT INTO budget (
      id,
      household_id,
      category_id,
      name,
      amount,
      currency,
      period,
      start_date,
      end_date,
      is_rollover,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL,
      1,
      0
    )`,
    [
      id,
      input.householdId,
      input.categoryId,
      input.name,
      input.amount.amount,
      currency.code,
      input.period,
      input.startDate,
      input.endDate ?? null,
      input.isRollover ? 1 : 0,
    ],
  );

  const createdBudget = getBudgetById(db, id);
  if (!createdBudget) {
    throw new Error('Failed to create budget.');
  }

  return createdBudget;
}

/** Create a full starter budget from a named template. */
export function createBudgetTemplate(db: SqliteDb, input: CreateBudgetTemplateInput): Budget[] {
  const template = getBudgetStarterTemplateById(input.templateId);
  if (!template || !template.isAvailable) {
    throw new Error('Selected starter budget template is not available.');
  }

  const categories = getAllCategories(db);
  const householdId = resolveTemplateHouseholdId(db, categories);
  const templateCategoriesByName = new Map(
    template.categories.map((category) => [normalizeCategoryName(category.name), category]),
  );

  return template.categories.flatMap((templateCategory) => {
    const parentCategory = templateCategory.parentName
      ? ensureTemplateCategory(
          db,
          categories,
          householdId,
          templateCategoriesByName.get(normalizeCategoryName(templateCategory.parentName)) ?? {
            emoji: '🍽️',
            name: templateCategory.parentName,
            amountCents: 0,
            icon: 'utensils',
            color: '#16A34A',
          },
        )
      : null;
    const category = ensureTemplateCategory(
      db,
      categories,
      householdId,
      templateCategory,
      parentCategory?.id ?? null,
    );

    if (templateCategory.createBudget === false) {
      return [];
    }

    return [
      createBudget(db, {
        householdId,
        categoryId: category.id,
        name: templateCategory.name,
        amount: { amount: templateCategory.amountCents },
        period: 'MONTHLY',
        startDate: input.startDate,
        endDate: null,
        isRollover: false,
      }),
    ];
  });
}

/** Update a budget row and return the refreshed budget. */
export function updateBudget(
  db: SqliteDb,
  budgetId: SyncId,
  updates: UpdateBudgetInput,
): Budget | null {
  const existingBudget = getBudgetById(db, budgetId);
  if (!existingBudget) {
    return null;
  }

  const mergedBudget = {
    householdId: updates.householdId ?? existingBudget.householdId,
    categoryId: updates.categoryId ?? existingBudget.categoryId,
    name: updates.name ?? existingBudget.name,
    amount: updates.amount ?? existingBudget.amount,
    currency: updates.currency ?? existingBudget.currency,
    period: updates.period ?? existingBudget.period,
    startDate: updates.startDate ?? existingBudget.startDate,
    endDate: updates.endDate !== undefined ? updates.endDate : existingBudget.endDate,
    isRollover: updates.isRollover ?? existingBudget.isRollover,
  };

  execute(
    db,
    `UPDATE budget
        SET household_id = ?,
            category_id = ?,
            name = ?,
            amount = ?,
            currency = ?,
            period = ?,
            start_date = ?,
            end_date = ?,
            is_rollover = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedBudget.householdId,
      mergedBudget.categoryId,
      mergedBudget.name,
      mergedBudget.amount.amount,
      mergedBudget.currency.code,
      mergedBudget.period,
      mergedBudget.startDate,
      mergedBudget.endDate,
      mergedBudget.isRollover ? 1 : 0,
      budgetId,
    ],
  );

  return getBudgetById(db, budgetId);
}

/** Soft-delete a budget row by marking its deleted timestamp. */
export function deleteBudget(db: SqliteDb, budgetId: SyncId): boolean {
  const existingBudget = getBudgetById(db, budgetId);
  if (!existingBudget) {
    return false;
  }

  execute(
    db,
    `UPDATE budget
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [budgetId],
  );

  return true;
}

/** Return all non-deleted budgets for a given cadence. */
export function getBudgetsByPeriod(db: SqliteDb, period: BudgetPeriod): Budget[] {
  return query<Row>(db, `${BUDGET_BASE_QUERY} AND period = ? ORDER BY start_date DESC, name ASC`, [
    period,
  ]).rows.map(mapBudget);
}

/** Return a budget alongside its calculated spending and remaining amounts. */
export function getBudgetWithSpending(db: SqliteDb, budgetId: SyncId): BudgetWithSpending | null {
  const row = queryOne<Row>(
    db,
    `${buildBudgetCategoryScopeCte()}
     ${TRANSACTION_CATEGORY_AMOUNTS_CTE}
     SELECT b.id AS id,
            b.household_id AS household_id,
            b.category_id AS category_id,
            b.name AS name,
            b.amount AS amount,
            b.currency AS currency,
            b.period AS period,
            b.start_date AS start_date,
            b.end_date AS end_date,
            b.is_rollover AS is_rollover,
            b.created_at AS created_at,
            b.updated_at AS updated_at,
            b.deleted_at AS deleted_at,
            b.sync_version AS sync_version,
            b.is_synced AS is_synced,
            COALESCE(
              SUM(
                CASE
                  WHEN t.type = 'EXPENSE' THEN ABS(t.amount)
                  ELSE 0
                END
              ),
              0
            ) AS spent_amount
       FROM budget b
       LEFT JOIN transaction_category_amounts t
         ON t.category_id IN (SELECT id FROM budget_category_scope)
        AND t.household_id = b.household_id
        AND t.date >= b.start_date
        AND (b.end_date IS NULL OR t.date <= b.end_date)
      WHERE b.deleted_at IS NULL
        AND b.id = ?
      GROUP BY b.id,
               b.household_id,
               b.category_id,
               b.name,
               b.amount,
               b.currency,
               b.period,
               b.start_date,
               b.end_date,
               b.is_rollover,
               b.created_at,
               b.updated_at,
               b.deleted_at,
               b.sync_version,
               b.is_synced`,
    [budgetId, budgetId],
  );

  if (!row) {
    return null;
  }

  const budget = mapBudget(row);
  const spentAmount = mapCents(row.spent_amount, 'budget.spent_amount');

  return {
    ...budget,
    spentAmount,
    remainingAmount: cents(budget.amount.amount - spentAmount.amount),
  };
}

/** Return spending grouped by category within the budget's category tree. */
export function getBudgetSpendingBreakdown(
  db: SqliteDb,
  budgetId: SyncId,
): BudgetSpendingBreakdownItem[] {
  return query<Row>(
    db,
    `${buildBudgetCategoryScopeCte()}
     ${TRANSACTION_CATEGORY_AMOUNTS_CTE}
     SELECT c.id AS category_id,
            c.name AS category_name,
            COALESCE(
              SUM(
                CASE
                  WHEN t.type = 'EXPENSE' THEN ABS(t.amount)
                  ELSE 0
                END
              ),
              0
            ) AS spent_amount
       FROM budget b
       JOIN budget_category_scope scope
         ON 1 = 1
       JOIN category c
         ON c.id = scope.id
        AND c.deleted_at IS NULL
       LEFT JOIN transaction_category_amounts t
         ON t.category_id = c.id
        AND t.household_id = b.household_id
        AND t.date >= b.start_date
        AND (b.end_date IS NULL OR t.date <= b.end_date)
      WHERE b.deleted_at IS NULL
        AND b.id = ?
      GROUP BY c.id, c.name
      HAVING spent_amount > 0
      ORDER BY spent_amount DESC, c.name ASC`,
    [budgetId, budgetId],
  ).rows.map((row) => ({
    categoryId: requireString(row.category_id, 'budget_breakdown.category_id'),
    categoryName: requireString(row.category_name, 'budget_breakdown.category_name'),
    spentAmount: mapCents(row.spent_amount, 'budget_breakdown.spent_amount'),
  }));
}
