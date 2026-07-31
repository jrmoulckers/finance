// SPDX-License-Identifier: BUSL-1.1

import type { Budget, BudgetPeriod, Category, Currency, SyncId } from '../../kmp/bridge';
import { Currencies, cents } from '../../kmp/bridge';
import {
  getBudgetStarterTemplateById,
  type BudgetStarterTemplateCategory,
  type BudgetStarterTemplateId,
} from '../../lib/budgeting/starter-budget-templates';
import { execute, query, queryOne, type AsyncDb, type Row } from '../async-db';
import { createCategory, getAllCategories } from './categories';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  requireNumber,
  requireString,
  toBoolean,
} from './helpers';

const BUDGET_COLUMNS = [
  'id',
  'household_id',
  'category_id',
  'name',
  'amount_cents',
  'currency_code',
  'period',
  'start_date',
  'end_date',
  'is_rollover',
  'sort_order',
  'created_at',
  'updated_at',
  'deleted_at',
].join(', ');

const BUDGET_BASE_QUERY = `SELECT ${BUDGET_COLUMNS} FROM budgets WHERE deleted_at IS NULL`;

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
  sortOrder?: number;
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
  sortOrder?: number;
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

async function findFirstHouseholdId(db: AsyncDb): Promise<SyncId | null> {
  const row = await queryOne<Row>(
    db,
    'SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  );
  return row ? requireString(row.id, 'household.id') : null;
}

async function resolveTemplateHouseholdId(db: AsyncDb, categories: Category[]): Promise<SyncId> {
  const existingHouseholdId =
    categories.find((category) => category.isIncome === false)?.householdId ??
    categories[0]?.householdId;

  if (existingHouseholdId) {
    return existingHouseholdId;
  }

  const householdId = await findFirstHouseholdId(db);
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

async function ensureTemplateCategory(
  db: AsyncDb,
  categories: Category[],
  householdId: SyncId,
  templateCategory: BudgetStarterTemplateCategory,
  parentId: SyncId | null = null,
): Promise<Category> {
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

  const createdCategory = await createCategory(db, {
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
      FROM budgets
     WHERE id = ?
       AND deleted_at IS NULL
    UNION ALL
    SELECT c.id
      FROM categories c
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
           WHEN split.value IS NULL THEN tx.amount_cents
           ELSE CAST(json_extract(split.value, '$.amount') AS INTEGER)
         END AS amount
    FROM transactions tx
    LEFT JOIN json_each(COALESCE(NULLIF(tx.splits, ''), '[]')) AS split
   WHERE tx.deleted_at IS NULL
)`;

function mapBudget(row: Row): Budget {
  return {
    id: requireString(row.id, 'budget.id'),
    householdId: requireString(row.household_id, 'budget.household_id'),
    categoryId: requireString(row.category_id, 'budget.category_id'),
    name: requireString(row.name, 'budget.name'),
    amount: mapCents(row.amount_cents, 'budget.amount_cents'),
    currency: mapCurrency(row.currency_code),
    period: requireString(row.period, 'budget.period') as BudgetPeriod,
    startDate: requireString(row.start_date, 'budget.start_date'),
    endDate: optionalString(row.end_date),
    isRollover: toBoolean(row.is_rollover),
    sortOrder: row.sort_order == null ? 0 : requireNumber(row.sort_order, 'budget.sort_order'),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted budgets ordered by persisted sort order. */
export async function getAllBudgets(db: AsyncDb): Promise<Budget[]> {
  const { rows } = await query<Row>(
    db,
    `${BUDGET_BASE_QUERY} ORDER BY sort_order ASC, start_date DESC, name ASC`,
  );
  return rows.map(mapBudget);
}

/** Find a single non-deleted budget by its identifier. */
export async function getBudgetById(db: AsyncDb, budgetId: SyncId): Promise<Budget | null> {
  const row = await queryOne<Row>(db, `${BUDGET_BASE_QUERY} AND id = ?`, [budgetId]);
  return row ? mapBudget(row) : null;
}

/** Insert a new budget row and return the created budget. */
export async function createBudget(db: AsyncDb, input: CreateBudgetInput): Promise<Budget> {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;
  const sortOrder = input.sortOrder ?? 0;

  await execute(
    db,
    `INSERT INTO budgets (
      id,
      household_id,
      category_id,
      name,
      amount_cents,
      currency_code,
      period,
      start_date,
      end_date,
      is_rollover,
      sort_order,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL
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
      sortOrder,
    ],
  );

  const createdBudget = await getBudgetById(db, id);
  if (!createdBudget) {
    throw new Error('Failed to create budget.');
  }

  return createdBudget;
}

/** Create a full starter budget from a named template. */
export async function createBudgetTemplate(
  db: AsyncDb,
  input: CreateBudgetTemplateInput,
): Promise<Budget[]> {
  const template = getBudgetStarterTemplateById(input.templateId);
  if (!template || !template.isAvailable) {
    throw new Error('Selected starter budget template is not available.');
  }

  const categories = await getAllCategories(db);
  const householdId = await resolveTemplateHouseholdId(db, categories);
  const templateCategoriesByName = new Map(
    template.categories.map((category) => [normalizeCategoryName(category.name), category]),
  );

  const budgets: Budget[] = [];
  for (const templateCategory of template.categories) {
    const parentCategory = templateCategory.parentName
      ? await ensureTemplateCategory(
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
    const category = await ensureTemplateCategory(
      db,
      categories,
      householdId,
      templateCategory,
      parentCategory?.id ?? null,
    );

    if (templateCategory.createBudget === false) {
      continue;
    }

    budgets.push(
      await createBudget(db, {
        householdId,
        categoryId: category.id,
        name: templateCategory.name,
        amount: { amount: templateCategory.amountCents },
        period: 'MONTHLY',
        startDate: input.startDate,
        endDate: null,
        isRollover: false,
      }),
    );
  }

  return budgets;
}

/** Update a budget row and return the refreshed budget. */
export async function updateBudget(
  db: AsyncDb,
  budgetId: SyncId,
  updates: UpdateBudgetInput,
): Promise<Budget | null> {
  const existingBudget = await getBudgetById(db, budgetId);
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
    sortOrder: updates.sortOrder ?? existingBudget.sortOrder ?? 0,
  };

  await execute(
    db,
    `UPDATE budgets
        SET household_id = ?,
            category_id = ?,
            name = ?,
            amount_cents = ?,
            currency_code = ?,
            period = ?,
            start_date = ?,
            end_date = ?,
            is_rollover = ?,
            sort_order = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION}
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
      mergedBudget.sortOrder,
      budgetId,
    ],
  );

  return await getBudgetById(db, budgetId);
}

/** Soft-delete a budget row by marking its deleted timestamp. */
export async function deleteBudget(db: AsyncDb, budgetId: SyncId): Promise<boolean> {
  const existingBudget = await getBudgetById(db, budgetId);
  if (!existingBudget) {
    return false;
  }

  await execute(
    db,
    `UPDATE budgets
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION}
      WHERE id = ?
        AND deleted_at IS NULL`,
    [budgetId],
  );

  return true;
}

export async function reorderBudgets(
  db: AsyncDb,
  orderedBudgetIds: readonly SyncId[],
): Promise<void> {
  for (const [sortOrder, budgetId] of orderedBudgetIds.entries()) {
    await execute(
      db,
      `UPDATE budgets
          SET sort_order = ?,
              updated_at = ${SQLITE_NOW_EXPRESSION}
        WHERE id = ?
          AND deleted_at IS NULL`,
      [sortOrder, budgetId],
    );
  }
}

/** Return all non-deleted budgets for a given cadence. */
export async function getBudgetsByPeriod(db: AsyncDb, period: BudgetPeriod): Promise<Budget[]> {
  const { rows } = await query<Row>(
    db,
    `${BUDGET_BASE_QUERY} AND period = ? ORDER BY sort_order ASC, start_date DESC, name ASC`,
    [period],
  );
  return rows.map(mapBudget);
}

/** Return a budget alongside its calculated spending and remaining amounts. */
export async function getBudgetWithSpending(
  db: AsyncDb,
  budgetId: SyncId,
): Promise<BudgetWithSpending | null> {
  const row = await queryOne<Row>(
    db,
    `${buildBudgetCategoryScopeCte()}
     ${TRANSACTION_CATEGORY_AMOUNTS_CTE}
     SELECT b.id AS id,
            b.household_id AS household_id,
            b.category_id AS category_id,
            b.name AS name,
            b.amount_cents AS amount_cents,
            b.currency_code AS currency_code,
            b.period AS period,
            b.start_date AS start_date,
            b.end_date AS end_date,
            b.is_rollover AS is_rollover,
            b.created_at AS created_at,
            b.updated_at AS updated_at,
            b.deleted_at AS deleted_at,
            COALESCE(
              SUM(
                CASE
                  WHEN t.type = 'EXPENSE' THEN ABS(t.amount)
                  ELSE 0
                END
              ),
              0
            ) AS spent_amount
       FROM budgets b
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
               b.amount_cents,
               b.currency_code,
               b.period,
               b.start_date,
               b.end_date,
               b.is_rollover,
               b.created_at,
               b.updated_at,
               b.deleted_at`,
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
export async function getBudgetSpendingBreakdown(
  db: AsyncDb,
  budgetId: SyncId,
): Promise<BudgetSpendingBreakdownItem[]> {
  const { rows } = await query<Row>(
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
       FROM budgets b
       JOIN budget_category_scope scope
         ON 1 = 1
       JOIN categories c
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
  );
  return rows.map((row) => ({
    categoryId: requireString(row.category_id, 'budget_breakdown.category_id'),
    categoryName: requireString(row.category_name, 'budget_breakdown.category_name'),
    spentAmount: mapCents(row.spent_amount, 'budget_breakdown.spent_amount'),
  }));
}
