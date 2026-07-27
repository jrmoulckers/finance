// SPDX-License-Identifier: BUSL-1.1

import type { Category, SyncId } from '../../kmp/bridge';
import { execute, query, queryOne, type AsyncDb, type Row } from '../async-db';
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
  'is_biometric_protected',
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
  isBiometricProtected?: boolean;
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
  isBiometricProtected?: boolean;
}

export function mapCategory(row: Row): Category {
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
    isBiometricProtected: toBoolean(row.is_biometric_protected),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted categories ordered by sort order and name. */
export async function getAllCategories(db: AsyncDb): Promise<Category[]> {
  const { rows } = await query<Row>(db, `${CATEGORY_BASE_QUERY} ORDER BY sort_order ASC, name ASC`);
  return rows.map(mapCategory);
}

/** Find a single non-deleted category by its identifier. */
export async function getCategoryById(db: AsyncDb, categoryId: SyncId): Promise<Category | null> {
  const row = await queryOne<Row>(db, `${CATEGORY_BASE_QUERY} AND id = ?`, [categoryId]);
  return row ? mapCategory(row) : null;
}

/** Insert a new category row and return the created category. */
export async function createCategory(db: AsyncDb, input: CreateCategoryInput): Promise<Category> {
  const id = crypto.randomUUID();

  await execute(
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
      is_biometric_protected,
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
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.parentId ?? null,
      input.isIncome ? 1 : 0,
      input.isSystem ? 1 : 0,
      input.sortOrder ?? 0,
      input.isBiometricProtected ? 1 : 0,
    ],
  );

  const createdCategory = await getCategoryById(db, id);
  if (!createdCategory) {
    throw new Error('Failed to create category.');
  }

  return createdCategory;
}

/** Update a category row and return the refreshed category. */
export async function updateCategory(
  db: AsyncDb,
  categoryId: SyncId,
  updates: UpdateCategoryInput,
): Promise<Category | null> {
  const existingCategory = await getCategoryById(db, categoryId);
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
    isBiometricProtected: updates.isBiometricProtected ?? existingCategory.isBiometricProtected,
  };

  await execute(
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
            is_biometric_protected = ?,
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
      mergedCategory.isBiometricProtected ? 1 : 0,
      categoryId,
    ],
  );

  const updatedCategory = await getCategoryById(db, categoryId);
  return updatedCategory;
}

/** Soft-delete a category row by marking its deleted timestamp. */
export async function deleteCategory(db: AsyncDb, categoryId: SyncId): Promise<boolean> {
  const existingCategory = await getCategoryById(db, categoryId);
  if (!existingCategory) {
    return false;
  }

  await execute(
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
export async function getCategoriesByParent(db: AsyncDb, parentId: SyncId): Promise<Category[]> {
  const { rows } = await query<Row>(
    db,
    `${CATEGORY_BASE_QUERY} AND parent_id = ? ORDER BY sort_order ASC, name ASC`,
    [parentId],
  );
  return rows.map(mapCategory);
}

/** Return root categories that do not have a parent. */
export async function getRootCategories(db: AsyncDb): Promise<Category[]> {
  const { rows } = await query<Row>(
    db,
    `${CATEGORY_BASE_QUERY} AND parent_id IS NULL ORDER BY sort_order ASC, name ASC`,
  );
  return rows.map(mapCategory);
}
