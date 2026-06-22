// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { AppIcon, type IconName } from '../components/icons';

import { ConfirmDialog, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { CategoryForm } from '../components/forms';
import type { CreateCategoryInput } from '../db/repositories/categories';
import { useCategories, useTransactions } from '../hooks';
import type { Category } from '../kmp/bridge';
import {
  applyFamilyKidsCategories,
  buildFamilyKidsCategoryPlan,
} from '../lib/categories/family-kids-categories';
import { selectSupportiveFamilyCopy } from '../lib/coaching/supportive-family-copy';
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
  const {
    categories,
    loading,
    error,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
    foodMealTemplate,
    ensureFoodMealCategories,
  } = useCategories();
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
  const [isFamilyKidsConfirmOpen, setIsFamilyKidsConfirmOpen] = useState(false);

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

  const familyKidsPlan = useMemo(() => buildFamilyKidsCategoryPlan(categories), [categories]);
  const familyKidsHouseholdId = categories[0]?.householdId ?? null;
  const familyKidsCopy = useMemo(
    () => selectSupportiveFamilyCopy({ presetComplete: familyKidsPlan.isComplete }),
    [familyKidsPlan.isComplete],
  );

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

  const handleAddFoodMealCategories = useCallback(() => {
    const nextTemplateState = ensureFoodMealCategories();
    if (!nextTemplateState) {
      setDeleteError('Failed to add Food & Meals categories.');
      return;
    }

    setDeleteError(null);
  }, [ensureFoodMealCategories]);

  const handleRequestFamilyKids = useCallback(() => {
    setDeleteError(null);
    setIsFamilyKidsConfirmOpen(true);
  }, []);

  const handleCancelFamilyKids = useCallback(() => {
    setIsFamilyKidsConfirmOpen(false);
  }, []);

  const handleConfirmFamilyKids = useCallback(() => {
    setIsFamilyKidsConfirmOpen(false);

    if (!familyKidsHouseholdId) {
      setDeleteError('Add a category first so we know which household to set up.');
      return;
    }

    const result = applyFamilyKidsCategories<Category>({
      categories,
      householdId: familyKidsHouseholdId,
      createCategory: (input) =>
        createCategory({
          householdId: input.householdId,
          name: input.name,
          icon: input.icon,
          color: input.color,
          sortOrder: input.sortOrder,
        }),
    });

    if (result.createdCount === 0 && !familyKidsPlan.isComplete) {
      setDeleteError('Failed to add family & kids categories.');
      return;
    }

    setDeleteError(null);
    refresh();
  }, [categories, createCategory, familyKidsHouseholdId, familyKidsPlan.isComplete, refresh]);

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

  const familyKidsConfirmMessage =
    familyKidsPlan.missing.length > 0
      ? `Add ${familyKidsPlan.missing.length} family & kids categor${
          familyKidsPlan.missing.length === 1 ? 'y' : 'ies'
        } to your list: ${familyKidsPlan.missing
          .map((definition) => definition.name)
          .join(', ')}. You can rename, set budgets for, or remove any of them later.`
      : 'All family & kids categories are already in your list. Nothing new will be added.';

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
      <ConfirmDialog
        isOpen={isFamilyKidsConfirmOpen}
        title="Add family & kids categories"
        message={familyKidsConfirmMessage}
        confirmLabel="Add categories"
        cancelLabel="Not now"
        variant="info"
        onConfirm={handleConfirmFamilyKids}
        onCancel={handleCancelFamilyKids}
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
          <section aria-label="Food & Meals setup" style={{ marginBottom: 'var(--spacing-6)' }}>
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 'var(--spacing-4)',
                  flexWrap: 'wrap',
                  marginBottom: 'var(--spacing-3)',
                }}
              >
                <div style={{ maxWidth: '40rem' }}>
                  <p className="card__title">Food & Meals setup</p>
                  <p style={{ color: 'var(--semantic-text-secondary)' }}>
                    Organize grocery and meal-planning spending under one parent category so food
                    budgets can break down groceries, dining out, delivery, coffee, and meal prep.
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--type-scale-caption-font-size)',
                      color: 'var(--semantic-text-secondary)',
                      marginTop: 'var(--spacing-2)',
                    }}
                  >
                    {foodMealTemplate.parentCategory
                      ? `${foodMealTemplate.subcategories.length} of 5 subcategories ready under ${foodMealTemplate.parentCategory.name}.`
                      : 'Create a Food & Meals parent category and all 5 subcategories in one step.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="form-button form-button--secondary"
                  onClick={handleAddFoodMealCategories}
                >
                  {foodMealTemplate.missingSubcategoryDefinitions.length === 0 &&
                  foodMealTemplate.parentCategory
                    ? 'Food & Meals ready'
                    : 'Add Food & Meals categories'}
                </button>
              </div>
              <ul style={{ display: 'grid', gap: 'var(--spacing-2)', paddingLeft: '1.25rem' }}>
                {foodMealTemplate.subcategories.map((category) => (
                  <li key={category.id}>
                    {category.icon} {category.name}
                  </li>
                ))}
                {foodMealTemplate.missingSubcategoryDefinitions.map((subcategory) => (
                  <li key={subcategory.name} style={{ color: 'var(--semantic-text-secondary)' }}>
                    {subcategory.icon} {subcategory.name}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section
            aria-labelledby="family-kids-setup-heading"
            style={{ marginBottom: 'var(--spacing-6)' }}
          >
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 'var(--spacing-4)',
                  flexWrap: 'wrap',
                  marginBottom: 'var(--spacing-3)',
                }}
              >
                <div style={{ maxWidth: '40rem' }}>
                  <h3 id="family-kids-setup-heading" className="card__title">
                    Family &amp; kids categories
                  </h3>
                  <p style={{ color: 'var(--semantic-text-secondary)' }}>
                    Seed kid-specific categories for school fees, childcare, activities &amp;
                    sports, birthdays &amp; gifts, field trips &amp; supplies, kids&rsquo; clothing,
                    and medical co-pays &mdash; the real costs of raising a family.
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--type-scale-caption-font-size)',
                      color: 'var(--semantic-text-secondary)',
                      marginTop: 'var(--spacing-2)',
                    }}
                  >
                    {familyKidsPlan.isComplete
                      ? `All ${familyKidsPlan.definitions.length} family & kids categories are ready.`
                      : `${familyKidsPlan.present.length} of ${familyKidsPlan.definitions.length} ready · ${familyKidsPlan.missing.length} will be added.`}
                  </p>
                </div>
                <button
                  type="button"
                  className="form-button form-button--secondary"
                  onClick={handleRequestFamilyKids}
                >
                  {familyKidsPlan.isComplete
                    ? 'Family & kids ready'
                    : 'Add family & kids categories'}
                </button>
              </div>
              <p
                role="note"
                style={{
                  color: 'var(--semantic-text-secondary)',
                  marginBottom: 'var(--spacing-3)',
                }}
              >
                <strong style={{ color: 'var(--semantic-text-primary)' }}>
                  {familyKidsCopy.headline}.
                </strong>{' '}
                {familyKidsCopy.body} {familyKidsCopy.smallWin}
              </p>
              <ul
                aria-label="Family and kids categories preview"
                style={{
                  display: 'grid',
                  gap: 'var(--spacing-2)',
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                }}
              >
                {familyKidsPlan.definitions.map((definition) => {
                  const isPresent = familyKidsPlan.present.some(
                    (entry) => entry.name === definition.name,
                  );
                  return (
                    <li
                      key={definition.name}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 'var(--spacing-2)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span aria-hidden="true">{definition.icon}</span>
                      <span style={{ color: 'var(--semantic-text-primary)' }}>
                        {definition.name}
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--type-scale-caption-font-size)',
                          fontWeight: 600,
                          color: isPresent
                            ? 'var(--semantic-text-secondary)'
                            : 'var(--semantic-text-primary)',
                          border: '1px solid var(--semantic-border-default)',
                          borderRadius: 'var(--radius-sm, 0.25rem)',
                          padding: '0 var(--spacing-2)',
                        }}
                      >
                        {isPresent ? 'Added' : 'Will be added'}
                      </span>
                      <span
                        style={{
                          color: 'var(--semantic-text-secondary)',
                          fontSize: 'var(--type-scale-caption-font-size)',
                        }}
                      >
                        {definition.description}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
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
