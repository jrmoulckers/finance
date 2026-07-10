// SPDX-License-Identifier: BUSL-1.1
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCategories, useTransactions } from '../hooks';
import type { Category, Transaction } from '../kmp/bridge';
import { CategoriesPage } from './CategoriesPage';

vi.mock('../hooks', () => ({
  useCategories: vi.fn(),
  useTransactions: vi.fn(),
}));

vi.mock('../components/forms', () => ({
  CategoryForm: ({
    isOpen,
    onSubmit,
    initialData,
  }: {
    isOpen: boolean;
    onSubmit: (data: {
      householdId: string;
      name: string;
      icon: string;
      color: string;
      parentId: null;
      isIncome: boolean;
      isSystem: boolean;
      sortOrder: number;
    }) => Promise<void>;
    initialData?: Category;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={initialData ? 'Edit Category' : 'Create Category'}>
        <button
          type="button"
          onClick={() =>
            void onSubmit({
              householdId: 'household-1',
              name: initialData ? `${initialData.name} Updated` : 'Travel',
              icon: initialData ? (initialData.icon ?? 'tag') : 'plane',
              color: initialData ? (initialData.color ?? '#64748B') : '#0EA5E9',
              parentId: null,
              isIncome: initialData?.isIncome ?? false,
              isSystem: initialData?.isSystem ?? false,
              sortOrder: initialData?.sortOrder ?? 4,
            })
          }
        >
          {initialData ? 'Save edited category' : 'Save new category'}
        </button>
      </div>
    ) : null,
}));

const mockedUseCategories = vi.mocked(useCategories);
const mockedUseTransactions = vi.mocked(useTransactions);
const createCategoryMock = vi.fn();
const updateCategoryMock = vi.fn();
const deleteCategoryMock = vi.fn();
const ensureFoodMealCategoriesMock = vi.fn();
const refreshCategoriesMock = vi.fn();
const refreshTransactionsMock = vi.fn();

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

afterEach(() => {
  cleanup();
});

const categories: Category[] = [
  {
    id: 'category-food',
    householdId: 'household-1',
    name: 'Food',
    icon: 'utensils',
    color: '#16A34A',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
  },
  {
    id: 'category-income',
    householdId: 'household-1',
    name: 'Income',
    icon: 'wallet',
    color: '#059669',
    parentId: null,
    isIncome: true,
    isSystem: true,
    sortOrder: 2,
    ...syncMetadata,
  },
  {
    id: 'category-utilities',
    householdId: 'household-1',
    name: 'Utilities',
    icon: 'bolt',
    color: '#7C3AED',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 3,
    ...syncMetadata,
  },
];

function makeTransaction(id: string, categoryId: string): Transaction {
  return {
    id,
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 1000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Store',
    note: null,
    date: '2025-03-06',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    ...syncMetadata,
  };
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    createCategoryMock.mockReset();
    updateCategoryMock.mockReset();
    deleteCategoryMock.mockReset();
    ensureFoodMealCategoriesMock.mockReset();
    refreshCategoriesMock.mockReset();
    refreshTransactionsMock.mockReset();

    createCategoryMock.mockReturnValue(categories[0]);
    updateCategoryMock.mockReturnValue(categories[0]);
    deleteCategoryMock.mockReturnValue(true);
    ensureFoodMealCategoriesMock.mockReturnValue({
      parentCategory: categories[0],
      subcategories: [
        {
          ...categories[0],
          id: 'category-groceries',
          name: 'Groceries',
          icon: '🛒',
          parentId: 'category-food',
        },
      ],
      missingSubcategoryDefinitions: [
        { name: 'Dining Out', icon: '🍽️', color: '#F97316', description: 'Restaurants' },
        { name: 'Delivery & Takeout', icon: '🥡', color: '#FB7185', description: 'Delivery' },
        { name: 'Coffee & Snacks', icon: '☕', color: '#A16207', description: 'Coffee' },
        { name: 'Meal Prep', icon: '🥗', color: '#0F766E', description: 'Meal prep' },
      ],
    });

    mockedUseCategories.mockReturnValue({
      categories,
      loading: false,
      error: null,
      refresh: refreshCategoriesMock,
      createCategory: createCategoryMock,
      updateCategory: updateCategoryMock,
      deleteCategory: deleteCategoryMock,
      foodMealTemplate: {
        parentCategory: categories[0],
        subcategories: [
          {
            ...categories[0],
            id: 'category-groceries',
            name: 'Groceries',
            icon: '🛒',
            parentId: 'category-food',
          },
        ],
        missingSubcategoryDefinitions: [
          { name: 'Dining Out', icon: '🍽️', color: '#F97316', description: 'Restaurants' },
          { name: 'Delivery & Takeout', icon: '🥡', color: '#FB7185', description: 'Delivery' },
          { name: 'Coffee & Snacks', icon: '☕', color: '#A16207', description: 'Coffee' },
          { name: 'Meal Prep', icon: '🥗', color: '#0F766E', description: 'Meal prep' },
        ],
      },
      ensureFoodMealCategories: ensureFoodMealCategoriesMock,
    });

    mockedUseTransactions.mockReturnValue({
      transactions: [
        makeTransaction('tx-1', 'category-food'),
        makeTransaction('tx-2', 'category-food'),
        makeTransaction('tx-3', 'category-income'),
      ],
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });
  });

  it('renders the category list with icon and color details', () => {
    render(<CategoriesPage />);

    expect(screen.getByRole('heading', { name: 'Categories', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Food', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Income', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Utilities', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('#16A34A')).toBeInTheDocument();
    expect(screen.getByText('utensils')).toBeInTheDocument();
  });

  it('shows the Food & Meals setup helper', () => {
    render(<CategoriesPage />);

    expect(screen.getByText('Food & Meals setup')).toBeInTheDocument();
    expect(screen.getAllByText(/Groceries/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /add food & meals categories/i }),
    ).toBeInTheDocument();
  });

  it('adds the Food & Meals category set', () => {
    render(<CategoriesPage />);

    fireEvent.click(screen.getByRole('button', { name: /add food & meals categories/i }));

    expect(ensureFoodMealCategoriesMock).toHaveBeenCalled();
  });

  it('shows the family & kids categories helper with a preview', async () => {
    render(<CategoriesPage />);

    expect(
      await screen.findByRole('heading', { name: /family & kids categories/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('School Fees')).toBeInTheDocument();
    expect(screen.getByText('Childcare & Daycare')).toBeInTheDocument();
    expect(screen.getByText('Medical & Co-pays')).toBeInTheDocument();
    // Status is conveyed with text, not color alone.
    expect(screen.getAllByText('Will be added').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /add family & kids categories/i }),
    ).toBeInTheDocument();
  });

  it('previews and applies the family & kids preset after confirmation', async () => {
    render(<CategoriesPage />);

    fireEvent.click(await screen.findByRole('button', { name: /add family & kids categories/i }));

    const dialog = await screen.findByRole('alertdialog', {
      name: /add family & kids categories/i,
    });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add categories' }));

    expect(createCategoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: 'household-1', name: 'School Fees' }),
    );
    expect(createCategoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Medical & Co-pays' }),
    );
    expect(createCategoryMock).toHaveBeenCalledTimes(7);
  });

  it('does not apply the family & kids preset when cancelled', async () => {
    render(<CategoriesPage />);

    fireEvent.click(await screen.findByRole('button', { name: /add family & kids categories/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it('adds a category', async () => {
    render(<CategoriesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save new category' }));

    await waitFor(() => {
      expect(createCategoryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          householdId: 'household-1',
          name: 'Travel',
          icon: 'plane',
          color: '#0EA5E9',
        }),
      );
    });
  });

  it('edits a category', async () => {
    render(<CategoriesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Food category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save edited category' }));

    await waitFor(() => {
      expect(updateCategoryMock).toHaveBeenCalledWith(
        'category-food',
        expect.objectContaining({ name: 'Food Updated' }),
      );
    });
  });

  it('warns about assigned transactions and deletes after confirmation', () => {
    render(<CategoriesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Food category' }));

    expect(screen.getByText(/used by 2 transactions/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Category' }));

    expect(deleteCategoryMock).toHaveBeenCalledWith('category-food');
  });

  it('filters categories by search query', () => {
    render(<CategoriesPage />);

    fireEvent.change(screen.getByLabelText('Search categories by name'), {
      target: { value: 'util' },
    });

    expect(screen.getByRole('heading', { name: 'Utilities', level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Food', level: 3 })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 3 categories/i)).toBeInTheDocument();
  });

  it('filters categories by income type', () => {
    render(<CategoriesPage />);

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'income' } });

    expect(screen.getByRole('heading', { name: 'Income', level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Food', level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Utilities', level: 3 })).not.toBeInTheDocument();
  });

  it('shows a no-results state and clears filters', () => {
    render(<CategoriesPage />);

    fireEvent.change(screen.getByLabelText('Search categories by name'), {
      target: { value: 'zzz-nope' },
    });

    expect(screen.getByRole('heading', { name: /no categories match/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getByRole('heading', { name: 'Food', level: 3 })).toBeInTheDocument();
  });
});
