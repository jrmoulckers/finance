// SPDX-License-Identifier: BUSL-1.1

import type { Category, SyncId } from '../../kmp/bridge';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import {
  SQLITE_NOW_EXPRESSION,
  mapSyncMetadata,
  optionalString,
  requireNumber,
  requireString,
  toBoolean,
} from './helpers';

const CATEGORY_COLUMNS = [
  'id',
  'household_id',
  'name',
  'icon',
  'color',
  'parent_id',
  'is_income',
  'is_system',
  'sort_order',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const CATEGORY_BASE_QUERY = `SELECT ${CATEGORY_COLUMNS} FROM category WHERE deleted_at IS NULL`;

/** Input used when creating a new category record. */
export interface CreateCategoryInput {
  householdId: SyncId;
  name: string;
  icon?: string | null;
  color?: string | null;
  parentId?: SyncId | null;
  isIncome?: boolean;
  isSystem?: boolean;
  sortOrder?: number;
}

/** Input used when updating an existing category record. */
export interface UpdateCategoryInput {
  householdId?: SyncId;
  name?: string;
  icon?: string | null;
  color?: string | null;
  parentId?: SyncId | null;
  isIncome?: boolean;
  isSystem?: boolean;
  sortOrder?: number;
}

function mapCategory(row: Row): Category {
  return {
    id: requireString(row.id, 'category.id'),
    householdId: requireString(row.household_id, 'category.household_id'),
    name: requireString(row.name, 'category.name'),
    icon: optionalString(row.icon),
    color: optionalString(row.color),
    parentId: optionalString(row.parent_id),
    isIncome: toBoolean(row.is_income),
    isSystem: toBoolean(row.is_system),
    sortOrder: requireNumber(row.sort_order, 'category.sort_order'),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted categories ordered by sort order and name. */
export function getAllCategories(db: SqliteDb): Category[] {
  return query<Row>(db, `${CATEGORY_BASE_QUERY} ORDER BY sort_order ASC, name ASC`).rows.map(mapCategory);
}

/** Find a single non-deleted category by its identifier. */
export function getCategoryById(db: SqliteDb, categoryId: SyncId): Category | null {
  const row = queryOne<Row>(db, `${CATEGORY_BASE_QUERY} AND id = ?`, [categoryId]);
  return row ? mapCategory(row) : null;
}

/** Insert a new category row and return the created category. */
export function createCategory(db: SqliteDb, input: CreateCategoryInput): Category {
  const id = crypto.randomUUID();

  execute(
    db,
    `INSERT INTO category (
      id,
      household_id,
      name,
      icon,
      color,
      parent_id,
      is_income,
      is_system,
      sort_order,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL,
      1,
      0
    )`,
    [
      id,
      input.householdId,
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.parentId ?? null,
      input.isIncome ? 1 : 0,
      input.isSystem ? 1 : 0,
      input.sortOrder ?? 0,
    ],
  );

  const createdCategory = getCategoryById(db, id);
  if (!createdCategory) {
    throw new Error('Failed to create category.');
  }

  return createdCategory;
}

/** Update a category row and return the refreshed category. */
export function updateCategory(
  db: SqliteDb,
  categoryId: SyncId,
  updates: UpdateCategoryInput,
): Category | null {
  const existingCategory = getCategoryById(db, categoryId);
  if (!existingCategory) {
    return null;
  }

  const mergedCategory = {
    householdId: updates.householdId ?? existingCategory.householdId,
    name: updates.name ?? existingCategory.name,
    icon: updates.icon !== undefined ? updates.icon : existingCategory.icon,
    color: updates.color !== undefined ? updates.color : existingCategory.color,
    parentId: updates.parentId !== undefined ? updates.parentId : existingCategory.parentId,
    isIncome: updates.isIncome ?? existingCategory.isIncome,
    isSystem: updates.isSystem ?? existingCategory.isSystem,
    sortOrder: updates.sortOrder ?? existingCategory.sortOrder,
  };

  execute(
    db,
    `UPDATE category
        SET household_id = ?,
            name = ?,
            icon = ?,
            color = ?,
            parent_id = ?,
            is_income = ?,
            is_system = ?,
            sort_order = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedCategory.householdId,
      mergedCategory.name,
      mergedCategory.icon,
      mergedCategory.color,
      mergedCategory.parentId,
      mergedCategory.isIncome ? 1 : 0,
      mergedCategory.isSystem ? 1 : 0,
      mergedCategory.sortOrder,
      categoryId,
    ],
  );

  return getCategoryById(db, categoryId);
}

/** Soft-delete a category row by marking its deleted timestamp. */
export function deleteCategory(db: SqliteDb, categoryId: SyncId): boolean {
  const existingCategory = getCategoryById(db, categoryId);
  if (!existingCategory) {
    return false;
  }

  execute(
    db,
    `UPDATE category
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [categoryId],
  );

  return true;
}

/** Return all child categories for a given parent category. */
export function getCategoriesByParent(db: SqliteDb, parentId: SyncId): Category[] {
  return query<Row>(
    db,
    `${CATEGORY_BASE_QUERY} AND parent_id = ? ORDER BY sort_order ASC, name ASC`,
    [parentId],
  ).rows.map(mapCategory);
}

/** Return root categories that do not have a parent. */
export function getRootCategories(db: SqliteDb): Category[] {
  return query<Row>(db, `${CATEGORY_BASE_QUERY} AND parent_id IS NULL ORDER BY sort_order ASC, name ASC`).rows.map(
    mapCategory,
  );
}
