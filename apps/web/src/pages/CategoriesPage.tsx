// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { AppIcon, type IconName } from '../components/icons';

import { ConfirmDialog, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { CategoryForm } from '../components/forms';
import type { CreateCategoryInput } from '../db/repositories/categories';
import { useCategories, useTransactions } from '../hooks';
import type { Category } from '../kmp/bridge';
import '../styles/pages.css';

function isCustomCategoryIcon(iconName: string | null | undefined): iconName is string {
  return Boolean(iconName && iconName.length <= 4);
}

function getCategoryIcon(iconName: string | null | undefined): IconName {
  switch (iconName) {
    case 'utensils':
    case 'food':
    case 'groceries':
      return 'shopping-cart';
    case 'home':
      return 'home';
    case 'car':
    case 'transport':
      return 'car';
    case 'film':
    case 'entertainment':
      return 'film';
    case 'wallet':
    case 'income':
      return 'wallet';
    case 'bolt':
    case 'utilities':
      return 'lightning';
    case 'heart':
    case 'health':
      return 'heart-pulse';
    default:
      return 'tag';
  }
}

function getUsageLabel(count: number): string {
  if (count === 0) {
    return 'No transactions';
  }

  return `${count} transaction${count === 1 ? '' : 's'}`;
}

export const CategoriesPage: React.FC = () => {
  const { categories, loading, error, refresh, createCategory, updateCategory, deleteCategory } =
    useCategories();
  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const transactionCountsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.categoryId) {
        counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [transactions]);

  const childCountsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      if (category.parentId) {
        counts.set(category.parentId, (counts.get(category.parentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [categories]);

  const isLoading = loading || transactionsLoading;
  const resolvedError = error ?? transactionsError;

  const handleRetry = useCallback(() => {
    refresh();
    refreshTransactions();
  }, [refresh, refreshTransactions]);

  const handleAddCategory = useCallback(() => {
    setEditingCategory(null);
    setDeleteError(null);
    setIsFormOpen(true);
  }, []);

  const handleEditCategory = useCallback((category: Category) => {
    setEditingCategory(category);
    setDeleteError(null);
    setIsFormOpen(true);
  }, []);

  const handleCancelForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingCategory(null);
  }, []);

  const handleSubmitCategory = useCallback(
    async (data: CreateCategoryInput) => {
      if (editingCategory) {
        const updated = updateCategory(editingCategory.id, data);
        if (updated === null) {
          throw new Error('Failed to update category.');
        }
      } else {
        const created = createCategory(data);
        if (created === null) {
          throw new Error('Failed to create category.');
        }
      }

      setIsFormOpen(false);
      setEditingCategory(null);
    },
    [createCategory, editingCategory, updateCategory],
  );

  const handleRequestDelete = useCallback((category: Category) => {
    setDeletingCategory(category);
    setDeleteError(null);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeletingCategory(null);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deletingCategory) {
      return;
    }

    const deleted = deleteCategory(deletingCategory.id);
    if (deleted) {
      setDeletingCategory(null);
      setDeleteError(null);
    } else {
      setDeleteError(`Failed to delete ${deletingCategory.name}.`);
    }
  }, [deleteCategory, deletingCategory]);

  const pageHeader = (
    <div className="page-header">
      <h2 className="page-heading">Categories</h2>
      <button
        type="button"
        className="form-button form-button--primary"
        onClick={handleAddCategory}
        aria-label="Add category"
      >
        + Add Category
      </button>
    </div>
  );

  const deletingTransactionCount = deletingCategory
    ? (transactionCountsByCategory.get(deletingCategory.id) ?? 0)
    : 0;
  const deletingChildCount = deletingCategory
    ? (childCountsByCategory.get(deletingCategory.id) ?? 0)
    : 0;
  const deleteMessage = deletingCategory
    ? [
        `Delete the ${deletingCategory.name} category?`,
        deletingTransactionCount > 0
          ? `It is used by ${deletingTransactionCount} transaction${deletingTransactionCount === 1 ? '' : 's'}, so review or reassign those transactions after deleting.`
          : 'It is not currently assigned to any transactions.',
        deletingChildCount > 0
          ? `It also has ${deletingChildCount} subcategor${deletingChildCount === 1 ? 'y' : 'ies'} that will remain in the list.`
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <>
      {pageHeader}

      <CategoryForm
        isOpen={isFormOpen}
        onCancel={handleCancelForm}
        onSubmit={handleSubmitCategory}
        categories={categories}
        initialData={editingCategory ?? undefined}
      />
      <ConfirmDialog
        isOpen={deletingCategory !== null}
        title="Delete Category"
        message={deleteMessage}
        confirmLabel="Delete Category"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {isLoading ? (
        <div className="page-loading">
          <LoadingSpinner label="Loading categories" />
        </div>
      ) : resolvedError ? (
        <ErrorBanner message={resolvedError} onRetry={handleRetry} />
      ) : categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create categories to organize transactions, budgets, and reports."
        />
      ) : (
        <>
          {deleteError && <ErrorBanner message={deleteError} />}
          <p className="page-summary" aria-live="polite">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} available for
            transaction organization.
          </p>
          <section aria-label="Categories list">
            <div className="card-grid card-grid--2">
              {categories.map((category) => {
                const transactionCount = transactionCountsByCategory.get(category.id) ?? 0;
                const parentCategory = category.parentId
                  ? categoriesById.get(category.parentId)
                  : undefined;

                return (
                  <article
                    key={category.id}
                    className="card category-card"
                    aria-label={`${category.name} category`}
                  >
                    <header className="category-card__header">
                      <div className="category-card__title-row">
                        <span
                          aria-hidden="true"
                          className="category-card__icon"
                          style={{
                            background: category.color ?? 'var(--semantic-background-secondary)',
                          }}
                        >
                          {isCustomCategoryIcon(category.icon) ? (
                            category.icon
                          ) : (
                            <AppIcon name={getCategoryIcon(category.icon)} />
                          )}
                        </span>
                        <h3 className="category-card__name">{category.name}</h3>
                      </div>
                      <p className="category-card__meta">
                        {category.isIncome ? 'Income' : 'Expense'} ·{' '}
                        {getUsageLabel(transactionCount)}
                        {parentCategory ? ` · Child of ${parentCategory.name}` : ''}
                        {category.isSystem ? ' · System' : ''}
                      </p>
                      <div className="category-card__actions">
                        <button
                          type="button"
                          className="form-button form-button--secondary"
                          onClick={() => handleEditCategory(category)}
                          aria-label={`Edit ${category.name} category`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="form-button form-button--secondary"
                          onClick={() => handleRequestDelete(category)}
                          aria-label={`Delete ${category.name} category`}
                        >
                          Delete
                        </button>
                      </div>
                    </header>
                    <dl className="category-card__details">
                      <div>
                        <dt className="card__title">Icon</dt>
                        <dd className="card__value">{category.icon ?? 'Default'}</dd>
                      </div>
                      <div>
                        <dt className="card__title">Color</dt>
                        <dd className="card__value">{category.color ?? 'Default'}</dd>
                      </div>
                      <div>
                        <dt className="card__title">Sort order</dt>
                        <dd className="card__value">{category.sortOrder}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
};

export default CategoriesPage;
