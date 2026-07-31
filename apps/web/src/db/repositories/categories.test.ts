// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row, AsyncDb } from '../async-db';
import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoriesByParent,
  getCategoryById,
  type CreateCategoryInput,
} from './categories';

// Mock async-db module
vi.mock('../async-db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

// Import mocked functions
import { execute, query, queryOne } from '../async-db';

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

describe('categories repository', () => {
  const mockDb = {} as AsyncDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllCategories', () => {
    it('should return mapped category objects', async () => {
      const mockRows: Row[] = [
        {
          id: 'cat-1',
          household_id: 'hh-1',
          name: 'Food & Dining',
          icon: 'utensils',
          color: '#ef4444',
          parent_id: null,
          is_income: 0,
          is_system: 1,
          sort_order: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
        },
        {
          id: 'cat-2',
          household_id: 'hh-1',
          name: 'Restaurants',
          icon: null,
          color: null,
          parent_id: 'cat-1',
          is_income: 0,
          is_system: 0,
          sort_order: 2,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
        },
      ];

      mockQuery.mockResolvedValue({ columns: [], rows: mockRows });

      const categories = await getAllCategories(mockDb);

      expect(categories).toHaveLength(2);
      expect(categories[0]).toMatchObject({
        id: 'cat-1',
        name: 'Food & Dining',
        icon: 'utensils',
        color: '#ef4444',
        parentId: null,
        isIncome: false,
        isSystem: true,
        sortOrder: 1,
      });
      expect(categories[1]).toMatchObject({
        id: 'cat-2',
        name: 'Restaurants',
        icon: null,
        color: null,
        parentId: 'cat-1',
        isIncome: false,
        isSystem: false,
        sortOrder: 2,
      });
    });

    it('should filter out deleted categories via WHERE clause', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getAllCategories(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
      );
    });

    it('should order by sort_order and name', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getAllCategories(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('ORDER BY sort_order ASC, name ASC'),
      );
    });
  });

  describe('getCategoryById', () => {
    it('should return category when found', async () => {
      const mockRow: Row = {
        id: 'cat-1',
        household_id: 'hh-1',
        name: 'Category',
        icon: 'tag',
        color: '#3b82f6',
        parent_id: null,
        is_income: 0,
        is_system: 0,
        sort_order: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      };

      mockQueryOne.mockResolvedValue(mockRow);

      const category = await getCategoryById(mockDb, 'cat-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL AND id = ?'),
        ['cat-1'],
      );
      expect(category).not.toBeNull();
      expect(category?.id).toBe('cat-1');
    });

    it('should return null when not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const category = await getCategoryById(mockDb, 'nonexistent');

      expect(category).toBeNull();
    });

    it('should use parameterized query', async () => {
      mockQueryOne.mockResolvedValue(null);

      await getCategoryById(mockDb, 'cat-1');

      const sql = mockQueryOne.mock.calls[0][1];
      expect(sql).toContain('id = ?');
      expect(sql).not.toContain("id = 'cat-1'");
    });
  });

  describe('createCategory', () => {
    beforeEach(() => {
      mockQueryOne.mockResolvedValue({
        id: 'new-cat',
        household_id: 'hh-1',
        name: 'New Category',
        icon: null,
        color: null,
        parent_id: null,
        is_income: 0,
        is_system: 0,
        sort_order: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });
    });

    it('should execute INSERT with correct parameters', async () => {
      const input: CreateCategoryInput = {
        householdId: 'hh-1',
        name: 'New Category',
      };

      await createCategory(mockDb, input);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining([
          expect.any(String), // UUID
          'hh-1',
          'New Category',
          null, // icon
          null, // color
          null, // parentId
          0, // isIncome
          0, // isSystem
          0, // sortOrder
        ]),
      );
    });

    it('should use ? placeholders not string interpolation', async () => {
      const input: CreateCategoryInput = {
        householdId: 'hh-1',
        name: 'New Category',
      };

      await createCategory(mockDb, input);

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('VALUES (');
      expect(sql).toContain('?');
      expect(sql).not.toContain('hh-1');
      expect(sql).not.toContain('New Category');
    });

    it('should handle optional fields', async () => {
      const input: CreateCategoryInput = {
        householdId: 'hh-1',
        name: 'Custom Category',
        icon: 'star',
        color: '#10b981',
        parentId: 'parent-cat',
        isIncome: true,
        isSystem: true,
        sortOrder: 5,
      };

      await createCategory(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[3]).toBe('star');
      expect(params[4]).toBe('#10b981');
      expect(params[5]).toBe('parent-cat');
      expect(params[6]).toBe(1); // isIncome
      expect(params[7]).toBe(1); // isSystem
      expect(params[8]).toBe(5); // sortOrder
    });

    it('should default boolean fields to false/0', async () => {
      const input: CreateCategoryInput = {
        householdId: 'hh-1',
        name: 'Category',
      };

      await createCategory(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[6]).toBe(0); // isIncome
      expect(params[7]).toBe(0); // isSystem
    });

    it('should default sortOrder to 0', async () => {
      const input: CreateCategoryInput = {
        householdId: 'hh-1',
        name: 'Category',
      };

      await createCategory(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[8]).toBe(0);
    });
  });

  describe('getCategoriesByParent', () => {
    it('should filter by parent_id with parameterized query', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getCategoriesByParent(mockDb, 'parent-1');

      expect(mockQuery).toHaveBeenCalledWith(mockDb, expect.stringContaining('parent_id = ?'), [
        'parent-1',
      ]);
    });

    it('should filter out deleted categories', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getCategoriesByParent(mockDb, 'parent-1');

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
        expect.anything(),
      );
    });

    it('should use ? placeholder not string interpolation', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getCategoriesByParent(mockDb, 'parent-1');

      const sql = mockQuery.mock.calls[0][1];
      expect(sql).toContain('parent_id = ?');
      expect(sql).not.toContain("parent_id = 'parent-1'");
    });

    it('should return child categories', async () => {
      const mockRows: Row[] = [
        {
          id: 'child-1',
          household_id: 'hh-1',
          name: 'Child Category 1',
          icon: null,
          color: null,
          parent_id: 'parent-1',
          is_income: 0,
          is_system: 0,
          sort_order: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
        },
        {
          id: 'child-2',
          household_id: 'hh-1',
          name: 'Child Category 2',
          icon: null,
          color: null,
          parent_id: 'parent-1',
          is_income: 0,
          is_system: 0,
          sort_order: 2,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
        },
      ];

      mockQuery.mockResolvedValue({ columns: [], rows: mockRows });

      const categories = await getCategoriesByParent(mockDb, 'parent-1');

      expect(categories).toHaveLength(2);
      expect(categories[0].parentId).toBe('parent-1');
      expect(categories[1].parentId).toBe('parent-1');
    });

    it('should order by sort_order and name', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getCategoriesByParent(mockDb, 'parent-1');

      const sql = mockQuery.mock.calls[0][1];
      expect(sql).toContain('ORDER BY sort_order ASC, name ASC');
    });
  });

  describe('deleteCategory', () => {
    it('should soft-delete by setting deleted_at', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'cat-1',
        household_id: 'hh-1',
        name: 'Category',
        icon: null,
        color: null,
        parent_id: null,
        is_income: 0,
        is_system: 0,
        sort_order: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });

      const result = await deleteCategory(mockDb, 'cat-1');

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(mockDb, expect.stringContaining('UPDATE categories'), [
        'cat-1',
      ]);
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET deleted_at =');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
    });

    it('should return false when category not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const result = await deleteCategory(mockDb, 'nonexistent');

      expect(result).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should use parameterized query', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'cat-1',
        household_id: 'hh-1',
        name: 'Category',
        icon: null,
        color: null,
        parent_id: null,
        is_income: 0,
        is_system: 0,
        sort_order: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });

      await deleteCategory(mockDb, 'cat-1');

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).not.toContain("id = 'cat-1'");
    });
  });
});
