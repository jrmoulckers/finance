// SPDX-License-Identifier: BUSL-1.1

/**
 * Per-category sharing and edit permissions engine.
 *
 * Manages a permission matrix where each household member can have a
 * different access level (HIDDEN, VIEW, EDIT) per category. The
 * effective permission calculator resolves the final access level for
 * any (member × category) pair.
 *
 * All functions are pure. No side effects.
 *
 * References: issue #1783
 */

import type { SyncId } from '../../kmp/bridge';
import type {
  CategoryPermission,
  CategoryPermissionLevel,
  PermissionMatrix,
  SetCategoryPermissionInput,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a composite key for the permission matrix.
 *
 * @param memberId - Household member ID
 * @param categoryId - Category ID
 * @returns Composite key string "memberId:categoryId"
 */
export function permissionKey(memberId: SyncId, categoryId: SyncId): string {
  return `${memberId}:${categoryId}`;
}

// ---------------------------------------------------------------------------
// Permission matrix operations
// ---------------------------------------------------------------------------

/**
 * Build a permission matrix from a list of permission entries.
 *
 * @param permissions - Array of individual permission entries
 * @returns A PermissionMatrix with fast lookup by member+category
 */
export function buildPermissionMatrix(
  permissions: readonly CategoryPermission[],
): PermissionMatrix {
  const entries = new Map<string, CategoryPermissionLevel>();
  for (const perm of permissions) {
    entries.set(permissionKey(perm.memberId, perm.categoryId), perm.level);
  }
  return { entries };
}

/**
 * Get the effective permission level for a member on a category.
 *
 * Default is 'VIEW' if no explicit permission has been set.
 *
 * @param matrix - The permission matrix
 * @param memberId - The member to check
 * @param categoryId - The category to check
 * @returns Effective permission level
 */
export function getEffectivePermission(
  matrix: PermissionMatrix,
  memberId: SyncId,
  categoryId: SyncId,
): CategoryPermissionLevel {
  return matrix.entries.get(permissionKey(memberId, categoryId)) ?? 'VIEW';
}

/**
 * Set or update a category permission in the permission list.
 *
 * If a permission already exists for the same (member, category) pair,
 * it is updated in place. Otherwise a new entry is appended.
 *
 * @param permissions - Current permission entries
 * @param input - The permission to set
 * @param now - Current timestamp (ISO-8601)
 * @returns Updated array of permissions
 */
export function setCategoryPermission(
  permissions: readonly CategoryPermission[],
  input: SetCategoryPermissionInput,
  now: string,
): CategoryPermission[] {
  const newPerm: CategoryPermission = {
    categoryId: input.categoryId,
    memberId: input.memberId,
    level: input.level,
    updatedAt: now,
  };

  const idx = permissions.findIndex(
    (p) => p.categoryId === input.categoryId && p.memberId === input.memberId,
  );

  if (idx >= 0) {
    const result = [...permissions];
    result[idx] = newPerm;
    return result;
  }

  return [...permissions, newPerm];
}

/**
 * Check whether a member can view a category.
 *
 * @param matrix - The permission matrix
 * @param memberId - Member to check
 * @param categoryId - Category to check
 * @returns True if the member has VIEW or EDIT access
 */
export function canViewCategory(
  matrix: PermissionMatrix,
  memberId: SyncId,
  categoryId: SyncId,
): boolean {
  const level = getEffectivePermission(matrix, memberId, categoryId);
  return level === 'VIEW' || level === 'EDIT';
}

/**
 * Check whether a member can edit a category.
 *
 * @param matrix - The permission matrix
 * @param memberId - Member to check
 * @param categoryId - Category to check
 * @returns True if the member has EDIT access
 */
export function canEditCategory(
  matrix: PermissionMatrix,
  memberId: SyncId,
  categoryId: SyncId,
): boolean {
  return getEffectivePermission(matrix, memberId, categoryId) === 'EDIT';
}

/**
 * Get all categories visible to a member (VIEW or EDIT).
 *
 * @param matrix - The permission matrix
 * @param memberId - Member to filter for
 * @param allCategoryIds - All category IDs in the household
 * @returns Category IDs the member can see
 */
export function getVisibleCategories(
  matrix: PermissionMatrix,
  memberId: SyncId,
  allCategoryIds: readonly SyncId[],
): SyncId[] {
  return allCategoryIds.filter((catId) => canViewCategory(matrix, memberId, catId));
}

/**
 * Get all categories a member can edit.
 *
 * @param matrix - The permission matrix
 * @param memberId - Member to filter for
 * @param allCategoryIds - All category IDs in the household
 * @returns Category IDs the member can edit
 */
export function getEditableCategories(
  matrix: PermissionMatrix,
  memberId: SyncId,
  allCategoryIds: readonly SyncId[],
): SyncId[] {
  return allCategoryIds.filter((catId) => canEditCategory(matrix, memberId, catId));
}

/**
 * Get all permissions for a specific member.
 *
 * @param permissions - All permission entries
 * @param memberId - Member to filter for
 * @returns Permissions belonging to the specified member
 */
export function getMemberPermissions(
  permissions: readonly CategoryPermission[],
  memberId: SyncId,
): CategoryPermission[] {
  return permissions.filter((p) => p.memberId === memberId);
}

/**
 * Get all permissions for a specific category.
 *
 * @param permissions - All permission entries
 * @param categoryId - Category to filter for
 * @returns Permissions for the specified category
 */
export function getCategoryPermissions(
  permissions: readonly CategoryPermission[],
  categoryId: SyncId,
): CategoryPermission[] {
  return permissions.filter((p) => p.categoryId === categoryId);
}

/**
 * Remove all permissions for a member (e.g., during offboarding).
 *
 * @param permissions - All permission entries
 * @param memberId - Member whose permissions to remove
 * @returns Permissions without the specified member's entries
 */
export function removeMemberPermissions(
  permissions: readonly CategoryPermission[],
  memberId: SyncId,
): CategoryPermission[] {
  return permissions.filter((p) => p.memberId !== memberId);
}
