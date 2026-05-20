// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { CategoryPermission } from './types';
import {
  buildPermissionMatrix,
  canEditCategory,
  canViewCategory,
  getEditableCategories,
  getEffectivePermission,
  getMemberPermissions,
  getVisibleCategories,
  permissionKey,
  removeMemberPermissions,
  setCategoryPermission,
} from './category-permissions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2025-01-15T10:00:00Z';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const CAT_1 = 'cat-food';
const CAT_2 = 'cat-transport';
const CAT_3 = 'cat-entertainment';

const SAMPLE_PERMISSIONS: CategoryPermission[] = [
  { categoryId: CAT_1, memberId: MEMBER_A, level: 'EDIT', updatedAt: NOW },
  { categoryId: CAT_2, memberId: MEMBER_A, level: 'VIEW', updatedAt: NOW },
  { categoryId: CAT_3, memberId: MEMBER_A, level: 'HIDDEN', updatedAt: NOW },
  { categoryId: CAT_1, memberId: MEMBER_B, level: 'VIEW', updatedAt: NOW },
  { categoryId: CAT_2, memberId: MEMBER_B, level: 'HIDDEN', updatedAt: NOW },
];

// ---------------------------------------------------------------------------
// permissionKey
// ---------------------------------------------------------------------------

describe('permissionKey', () => {
  it('produces a composite key', () => {
    expect(permissionKey(MEMBER_A, CAT_1)).toBe('member-a:cat-food');
  });
});

// ---------------------------------------------------------------------------
// buildPermissionMatrix / getEffectivePermission
// ---------------------------------------------------------------------------

describe('buildPermissionMatrix + getEffectivePermission', () => {
  const matrix = buildPermissionMatrix(SAMPLE_PERMISSIONS);

  it('returns the explicit permission level', () => {
    expect(getEffectivePermission(matrix, MEMBER_A, CAT_1)).toBe('EDIT');
    expect(getEffectivePermission(matrix, MEMBER_A, CAT_3)).toBe('HIDDEN');
    expect(getEffectivePermission(matrix, MEMBER_B, CAT_1)).toBe('VIEW');
  });

  it('defaults to VIEW when no permission is set', () => {
    expect(getEffectivePermission(matrix, MEMBER_B, CAT_3)).toBe('VIEW');
  });

  it('handles empty permission matrix', () => {
    const empty = buildPermissionMatrix([]);
    expect(getEffectivePermission(empty, MEMBER_A, CAT_1)).toBe('VIEW');
  });
});

// ---------------------------------------------------------------------------
// setCategoryPermission
// ---------------------------------------------------------------------------

describe('setCategoryPermission', () => {
  it('adds a new permission entry', () => {
    const result = setCategoryPermission(
      [],
      { categoryId: CAT_1, memberId: MEMBER_A, level: 'EDIT' },
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('EDIT');
  });

  it('updates an existing entry', () => {
    const result = setCategoryPermission(
      SAMPLE_PERMISSIONS,
      { categoryId: CAT_1, memberId: MEMBER_A, level: 'HIDDEN' },
      '2025-01-16T10:00:00Z',
    );
    expect(result).toHaveLength(SAMPLE_PERMISSIONS.length);
    const updated = result.find((p) => p.categoryId === CAT_1 && p.memberId === MEMBER_A);
    expect(updated?.level).toBe('HIDDEN');
    expect(updated?.updatedAt).toBe('2025-01-16T10:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// canViewCategory / canEditCategory
// ---------------------------------------------------------------------------

describe('canViewCategory / canEditCategory', () => {
  const matrix = buildPermissionMatrix(SAMPLE_PERMISSIONS);

  it('VIEW allows viewing but not editing', () => {
    expect(canViewCategory(matrix, MEMBER_A, CAT_2)).toBe(true);
    expect(canEditCategory(matrix, MEMBER_A, CAT_2)).toBe(false);
  });

  it('EDIT allows both viewing and editing', () => {
    expect(canViewCategory(matrix, MEMBER_A, CAT_1)).toBe(true);
    expect(canEditCategory(matrix, MEMBER_A, CAT_1)).toBe(true);
  });

  it('HIDDEN blocks both viewing and editing', () => {
    expect(canViewCategory(matrix, MEMBER_A, CAT_3)).toBe(false);
    expect(canEditCategory(matrix, MEMBER_A, CAT_3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getVisibleCategories / getEditableCategories
// ---------------------------------------------------------------------------

describe('getVisibleCategories / getEditableCategories', () => {
  const matrix = buildPermissionMatrix(SAMPLE_PERMISSIONS);
  const allCategories = [CAT_1, CAT_2, CAT_3];

  it('returns categories the member can see', () => {
    const visible = getVisibleCategories(matrix, MEMBER_A, allCategories);
    expect(visible).toEqual([CAT_1, CAT_2]);
  });

  it('returns categories the member can edit', () => {
    const editable = getEditableCategories(matrix, MEMBER_A, allCategories);
    expect(editable).toEqual([CAT_1]);
  });

  it('includes default VIEW categories (no explicit permission)', () => {
    const visible = getVisibleCategories(matrix, MEMBER_B, allCategories);
    // CAT_1 = VIEW, CAT_2 = HIDDEN, CAT_3 = no explicit → defaults to VIEW
    expect(visible).toEqual([CAT_1, CAT_3]);
  });
});

// ---------------------------------------------------------------------------
// getMemberPermissions / removeMemberPermissions
// ---------------------------------------------------------------------------

describe('getMemberPermissions', () => {
  it("returns only the specified member's permissions", () => {
    const result = getMemberPermissions(SAMPLE_PERMISSIONS, MEMBER_A);
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.memberId === MEMBER_A)).toBe(true);
  });
});

describe('removeMemberPermissions', () => {
  it('removes all permissions for the specified member', () => {
    const result = removeMemberPermissions(SAMPLE_PERMISSIONS, MEMBER_A);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.memberId === MEMBER_B)).toBe(true);
  });

  it('returns all permissions when member has none', () => {
    const result = removeMemberPermissions(SAMPLE_PERMISSIONS, 'member-c');
    expect(result).toHaveLength(SAMPLE_PERMISSIONS.length);
  });
});
