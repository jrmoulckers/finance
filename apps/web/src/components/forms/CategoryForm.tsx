// SPDX-License-Identifier: BUSL-1.1

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { useDatabase } from '../../db/DatabaseProvider';
import type { CreateCategoryInput } from '../../db/repositories/categories';
import { queryOne, type Row } from '../../db/sqlite-wasm';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import type { Category, SyncId } from '../../kmp/bridge';

import './forms.css';

export interface CategoryFormProps {
  isOpen: boolean;
  onCancel: () => void;
  onSubmit: (data: CreateCategoryInput) => Promise<void>;
  categories: Category[];
  initialData?: Category;
}

interface FormErrors {
  name?: string;
  sortOrder?: string;
}

function getFirstHouseholdId(db: ReturnType<typeof useDatabase>): SyncId | null {
  const row = queryOne<Row>(
    db,
    'SELECT id FROM household WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  );
  return row && typeof row.id === 'string' ? row.id : null;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nextSortOrder(categories: Category[]): number {
  return categories.reduce((max, category) => Math.max(max, category.sortOrder), 0) + 1;
}

function validate(name: string, sortOrder: string): FormErrors {
  const errors: FormErrors = {};
  if (name.trim().length === 0) {
    errors.name = 'Category name is required.';
  }

  const parsedSortOrder = Number(sortOrder);
  if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
    errors.sortOrder = 'Sort order must be zero or greater.';
  }

  return errors;
}

export function CategoryForm({
  isOpen,
  onCancel,
  onSubmit,
  categories,
  initialData,
}: CategoryFormProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const db = useDatabase();
  const isEditing = initialData !== undefined;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [parentId, setParentId] = useState('');
  const [isIncome, setIsIncome] = useState(false);
  const [sortOrder, setSortOrder] = useState('0');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initialValues = useMemo(
    () => ({
      name: initialData?.name ?? '',
      icon: initialData?.icon ?? '',
      color: initialData?.color ?? '',
      parentId: initialData?.parentId ?? '',
      isIncome: initialData?.isIncome ?? false,
      sortOrder: String(initialData?.sortOrder ?? nextSortOrder(categories)),
    }),
    [categories, initialData],
  );
  const isDirty =
    isOpen &&
    (name !== initialValues.name ||
      icon !== initialValues.icon ||
      color !== initialValues.color ||
      parentId !== initialValues.parentId ||
      isIncome !== initialValues.isIncome ||
      sortOrder !== initialValues.sortOrder);
  const { confirmNavigation } = useNavigationGuard({
    when: isDirty,
    message: 'Discard the category changes you have not saved yet?',
  });

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => {
        firstInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setName(initialValues.name);
    setIcon(initialValues.icon);
    setColor(initialValues.color);
    setParentId(initialValues.parentId);
    setIsIncome(initialValues.isIncome);
    setSortOrder(initialValues.sortOrder);
    setErrors({});
    setSubmitting(false);
    setSubmitError(null);
  }, [initialValues, isOpen]);

  const handleCancel = useCallback(() => {
    if (!confirmNavigation()) {
      return;
    }

    onCancel();
  }, [confirmNavigation, onCancel]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const fieldErrors = validate(name, sortOrder);
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      const householdId =
        initialData?.householdId ?? categories[0]?.householdId ?? getFirstHouseholdId(db);
      if (!householdId) {
        setSubmitError('No household found. Please create a household before saving categories.');
        return;
      }

      const input: CreateCategoryInput = {
        householdId,
        name: name.trim(),
        icon: nullableText(icon),
        color: nullableText(color),
        parentId: parentId || null,
        isIncome,
        isSystem: initialData?.isSystem ?? false,
        sortOrder: Number(sortOrder),
        isBiometricProtected: initialData?.isBiometricProtected ?? false,
      };

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        setErrors({});
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : isEditing
              ? 'Failed to update category.'
              : 'Failed to create category.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      categories,
      color,
      db,
      icon,
      initialData,
      isEditing,
      isIncome,
      name,
      onSubmit,
      parentId,
      sortOrder,
    ],
  );

  if (!isOpen) {
    return null;
  }

  const hasNameError = Boolean(errors.name);
  const hasSortOrderError = Boolean(errors.sortOrder);
  const dialogTitle = isEditing ? 'Edit Category' : 'Create Category';
  const submitLabel = isEditing ? 'Update Category' : 'Create Category';
  const submittingLabel = isEditing ? 'Updating…' : 'Creating…';
  const parentOptions = categories.filter((category) => category.id !== initialData?.id);

  return (
    <div className="form-dialog" role="presentation" onKeyDown={handleKeyDown}>
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />

      <div
        ref={panelRef}
        className="form-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-form-title"
      >
        <h2 id="category-form-title" className="form-dialog__title">
          {dialogTitle}
        </h2>

        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            <div className="form-group">
              <label
                htmlFor="category-name"
                className="form-group__label form-group__label--required"
              >
                Name
              </label>
              <input
                ref={firstInputRef}
                id="category-name"
                className={`form-input${hasNameError ? ' form-input--error' : ''}`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Groceries"
                aria-invalid={hasNameError}
                aria-describedby={hasNameError ? 'category-name-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasNameError && (
                <span id="category-name-error" className="form-error" role="alert">
                  {errors.name}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="category-icon" className="form-group__label">
                Icon
              </label>
              <input
                id="category-icon"
                className="form-input"
                type="text"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder="utensils or 🛒"
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label htmlFor="category-color" className="form-group__label">
                Color
              </label>
              <input
                id="category-color"
                className="form-input"
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                placeholder="#16A34A"
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label htmlFor="category-parent" className="form-group__label">
                Parent category
              </label>
              <select
                id="category-parent"
                className="form-select"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">No parent</option>
                {parentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="form-radio-group">
              <legend className="form-radio-group__legend">Category type</legend>
              <div className="form-radio-group__options">
                <label className="form-radio-option">
                  <input
                    type="radio"
                    name="category-type"
                    checked={!isIncome}
                    onChange={() => setIsIncome(false)}
                  />
                  <span className="form-radio-option__label">Expense</span>
                </label>
                <label className="form-radio-option">
                  <input
                    type="radio"
                    name="category-type"
                    checked={isIncome}
                    onChange={() => setIsIncome(true)}
                  />
                  <span className="form-radio-option__label">Income</span>
                </label>
              </div>
            </fieldset>

            <div className="form-group">
              <label htmlFor="category-sort-order" className="form-group__label">
                Sort order
              </label>
              <input
                id="category-sort-order"
                className={`form-input${hasSortOrderError ? ' form-input--error' : ''}`}
                type="number"
                min="0"
                step="1"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                aria-invalid={hasSortOrderError}
                aria-describedby={hasSortOrderError ? 'category-sort-order-error' : undefined}
              />
              {hasSortOrderError && (
                <span id="category-sort-order-error" className="form-error" role="alert">
                  {errors.sortOrder}
                </span>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="form-button form-button--primary"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CategoryForm;
