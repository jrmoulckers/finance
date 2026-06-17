// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible budget create/edit form.
 *
 * Renders a modal dialog with fields for creating or editing a budget:
 * category (required select), amount (required, dollars → cents),
 * period (select, default Monthly), and start date (default first of current
 * month).
 *
 * Validates input client-side with accessible error messages using
 * `aria-invalid` and `aria-describedby`. The `householdId` and budget `name`
 * are derived from the selected category, so no separate household prop is
 * needed. Amount is stored as integer cents — never as a float.
 *
 * Keyboard support: Tab navigation, Enter submits via the form element,
 * Escape cancels. Focus is trapped within the dialog and the first field
 * is autofocused when the dialog opens.
 *
 * @module components/forms/BudgetForm
 * @see {@link CreateBudgetInput} from db/repositories/budgets
 * References: issue #461, #487, #2148
 */

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
import type { CreateBudgetInput, CreateBudgetTemplateInput } from '../../db/repositories/budgets';
import { useAmountInput } from '../../hooks/useAmountInput';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import type { Budget, BudgetPeriod, Category } from '../../kmp/bridge';
import type { BudgetStarterTemplate } from '../../lib/budgeting/starter-budget-templates';
import { budgetSchema } from '../../lib/validation';
import { DatePicker } from '../common/DatePicker';
import { AmountInput } from './AmountInput';

import './forms.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Period options for the budget period select, ordered by display preference. */
const BUDGET_PERIODS: readonly { value: BudgetPeriod; label: string }[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

const budgetTemplateCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

type BudgetCreationMode = 'single' | 'template';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link BudgetForm}. */
export interface BudgetFormProps {
  /** Whether the form dialog is open. */
  isOpen: boolean;
  /** Callback invoked when the user cancels or presses Escape. */
  onCancel: () => void;
  /**
   * Callback invoked with validated form data when the user submits.
   * The `amount` field is already in integer cents.
   */
  onSubmit: (data: CreateBudgetInput) => Promise<void>;
  /** Optional callback for creating a starter budget from a template. */
  onSubmitTemplate?: (data: CreateBudgetTemplateInput) => Promise<void>;
  /** Available categories to assign the budget to. */
  categories: Category[];
  /** Starter budget templates available during creation. */
  templates?: BudgetStarterTemplate[];
  /** Existing budget data used to prefill the form when editing. */
  initialData?: Budget;
  /** Optional category selection applied when launching a focused budget template. */
  defaultCategoryId?: string;
  /** Expected income for the active planning cadence, in cents, used for over-assignment warnings. */
  expectedIncomeCents?: number;
  /** Assigned cents from other budgets before this form value is applied. */
  assignedBeforeEditCents?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the first day of the current month as an ISO local-date string (YYYY-MM-01). */
function firstOfCurrentMonthISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function formatTemplateAmount(amountCents: number): string {
  return budgetTemplateCurrencyFormatter.format(amountCents / 100);
}

function formatCents(amountCents: number): string {
  return budgetTemplateCurrencyFormatter.format(amountCents / 100);
}

function getDefaultTemplateId(templates: readonly BudgetStarterTemplate[]): string {
  return templates.find((template) => template.isAvailable)?.id ?? '';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  categoryId?: string;
  amount?: string;
  templateId?: string;
}

function validate(categoryId: string, amountCents: number, period: BudgetPeriod): FormErrors {
  const errors: FormErrors = {};
  const result = budgetSchema.safeParse({
    categoryId,
    amount: amountCents / 100,
    period,
  });

  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] === 'categoryId') {
        errors.categoryId = 'Please select a category.';
      }

      if (issue.path[0] === 'amount') {
        errors.amount = 'Amount must be greater than zero.';
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible modal form for creating or editing a budget.
 *
 * Provides fields for category, amount (dollars, converted to integer cents
 * before submission), period, and start date. Validates input and surfaces
 * errors with ARIA attributes. Traps focus within the dialog while open.
 */
export function BudgetForm({
  isOpen,
  onCancel,
  onSubmit,
  onSubmitTemplate,
  categories,
  templates = [],
  initialData,
  defaultCategoryId,
  expectedIncomeCents,
  assignedBeforeEditCents = 0,
}: BudgetFormProps) {
  // -- refs ----------------------------------------------------------------
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLSelectElement>(null);

  // -- state ---------------------------------------------------------------
  const [creationMode, setCreationMode] = useState<BudgetCreationMode>('single');
  const [templateId, setTemplateId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const decimalPlaces = initialData?.currency.decimalPlaces ?? 2;
  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces,
    allowNegative: false,
  });
  const [period, setPeriod] = useState<BudgetPeriod>('MONTHLY');
  const [startDate, setStartDate] = useState(firstOfCurrentMonthISO);
  const [isRollover, setIsRollover] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditMode = initialData !== undefined;
  const defaultTemplateId = useMemo(() => getDefaultTemplateId(templates), [templates]);
  const canUseTemplates = !isEditMode && Boolean(onSubmitTemplate) && templates.length > 0;
  const selectedTemplate =
    canUseTemplates && creationMode === 'template'
      ? (templates.find((template) => template.id === templateId && template.isAvailable) ?? null)
      : null;
  const initialValues = useMemo(
    () => ({
      creationMode: 'single' as BudgetCreationMode,
      templateId: defaultTemplateId,
      categoryId: initialData?.categoryId ?? defaultCategoryId ?? '',
      amountCents: initialData?.amount.amount ?? 0,
      period: initialData?.period ?? 'MONTHLY',
      startDate: initialData?.startDate ?? firstOfCurrentMonthISO(),
      isRollover: initialData?.isRollover ?? false,
    }),
    [defaultCategoryId, defaultTemplateId, initialData],
  );
  const isDirty =
    isOpen &&
    (creationMode !== initialValues.creationMode ||
      (canUseTemplates && templateId !== initialValues.templateId) ||
      categoryId !== initialValues.categoryId ||
      amountInput.cents !== initialValues.amountCents ||
      period !== initialValues.period ||
      startDate !== initialValues.startDate ||
      isRollover !== initialValues.isRollover);
  const { confirmNavigation } = useNavigationGuard({
    when: isDirty,
    message: 'Discard the budget changes you have not saved yet?',
  });

  // -- focus trap -----------------------------------------------------------
  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  // -- autofocus first field ------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => {
        firstInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  // -- reset on open -------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      setCreationMode(initialValues.creationMode);
      setTemplateId(initialValues.templateId);
      setCategoryId(initialValues.categoryId);
      amountInput.setCents(initialValues.amountCents);
      setPeriod(initialValues.period);
      setStartDate(initialValues.startDate);
      setIsRollover(initialValues.isRollover);
      setErrors({});
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [amountInput.setCents, initialValues, isOpen]);

  // -- handlers ------------------------------------------------------------

  const handleCancel = useCallback(() => {
    if (!confirmNavigation()) {
      return;
    }

    onCancel();
  }, [confirmNavigation, onCancel]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (canUseTemplates && creationMode === 'template') {
        if (!templateId) {
          setErrors({ templateId: 'Please select a starter budget template.' });
          return;
        }

        if (!onSubmitTemplate) {
          setSubmitError('Starter budget creation is unavailable right now.');
          return;
        }

        setErrors({});
        setSubmitting(true);
        setSubmitError(null);

        try {
          await onSubmitTemplate({
            templateId: templateId as CreateBudgetTemplateInput['templateId'],
            startDate,
          });
          setCreationMode('single');
          setTemplateId(defaultTemplateId);
          setStartDate(firstOfCurrentMonthISO());
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : 'Failed to create starter budget.');
        } finally {
          setSubmitting(false);
        }

        return;
      }

      const fieldErrors = validate(categoryId, amountInput.cents, period);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      const selectedCategory = categories.find((c) => c.id === categoryId);
      if (!selectedCategory) {
        setSubmitError('Selected category not found.');
        return;
      }

      const input: CreateBudgetInput = {
        householdId: selectedCategory.householdId,
        categoryId,
        name: selectedCategory.name,
        amount: { amount: amountInput.cents },
        period,
        startDate,
        endDate: null,
        isRollover,
      };

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        setCategoryId('');
        amountInput.reset(0);
        setPeriod('MONTHLY');
        setStartDate(firstOfCurrentMonthISO());
        setIsRollover(false);
        setErrors({});
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : isEditMode
              ? 'Failed to update budget.'
              : 'Failed to create budget.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      amountInput.cents,
      amountInput.reset,
      canUseTemplates,
      categories,
      categoryId,
      creationMode,
      defaultTemplateId,
      isEditMode,
      isRollover,
      onSubmit,
      onSubmitTemplate,
      period,
      startDate,
      templateId,
    ],
  );

  const overAssignmentWarning = useMemo(() => {
    if (expectedIncomeCents === undefined || amountInput.cents <= 0) {
      return null;
    }

    const proposedTotalCents = assignedBeforeEditCents + amountInput.cents;
    if (proposedTotalCents <= expectedIncomeCents) {
      return null;
    }

    return {
      overByCents: proposedTotalCents - expectedIncomeCents,
      proposedTotalCents,
    };
  }, [amountInput.cents, assignedBeforeEditCents, expectedIncomeCents]);

  // -- render --------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  const hasCategoryError = Boolean(errors.categoryId);
  const hasAmountError = Boolean(errors.amount);
  const hasTemplateError = Boolean(errors.templateId);
  const templateTotal = selectedTemplate?.categories.reduce(
    (total, category) => total + category.amountCents,
    0,
  );

  return (
    <div className="form-dialog" role="presentation" onKeyDown={handleKeyDown}>
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />

      <div
        ref={panelRef}
        className="form-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-form-title"
      >
        <h2 id="budget-form-title" className="form-dialog__title">
          {isEditMode ? 'Edit Budget' : 'Create Budget'}
        </h2>

        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            {canUseTemplates && (
              <fieldset className="form-radio-group form-fieldset">
                <legend className="form-radio-group__legend">
                  How do you want to get started?
                </legend>
                <div className="form-radio-group__options">
                  <label className="form-radio-option">
                    <input
                      type="radio"
                      name="budget-creation-mode"
                      value="single"
                      checked={creationMode === 'single'}
                      onChange={() => {
                        setCreationMode('single');
                        setErrors({});
                        setSubmitError(null);
                      }}
                    />
                    <span className="form-radio-option__label">Create one category</span>
                  </label>
                  <label className="form-radio-option">
                    <input
                      type="radio"
                      name="budget-creation-mode"
                      value="template"
                      checked={creationMode === 'template'}
                      onChange={() => {
                        setCreationMode('template');
                        setTemplateId(
                          (currentValue) => currentValue || getDefaultTemplateId(templates),
                        );
                        setErrors({});
                        setSubmitError(null);
                      }}
                    />
                    <span className="form-radio-option__label">Start from template</span>
                  </label>
                </div>
                <p className="form-group__help">
                  Templates give you a realistic starting point you can edit at any time.
                </p>
              </fieldset>
            )}

            {canUseTemplates && creationMode === 'template' ? (
              <>
                <fieldset className="form-fieldset" aria-describedby="budget-template-help">
                  <legend className="form-group__label form-group__label--required">
                    Template
                  </legend>
                  <p id="budget-template-help" className="form-group__help">
                    Pick a starter budget for the month you want to begin tracking.
                  </p>
                  <div className="budget-form__template-list">
                    {templates.map((template) => {
                      const disabled = !template.isAvailable;
                      return (
                        <label
                          key={template.id}
                          className={`budget-form__template-card${
                            templateId === template.id
                              ? ' budget-form__template-card--selected'
                              : ''
                          }${disabled ? ' budget-form__template-card--disabled' : ''}`}
                        >
                          <input
                            type="radio"
                            name="budget-template"
                            value={template.id}
                            checked={templateId === template.id}
                            onChange={() => {
                              setTemplateId(template.id);
                              setErrors((currentErrors) => ({
                                ...currentErrors,
                                templateId: undefined,
                              }));
                            }}
                            disabled={disabled}
                            aria-describedby={
                              disabled ? `budget-template-${template.id}-status` : undefined
                            }
                          />
                          <span className="budget-form__template-card-content">
                            <span className="budget-form__template-card-header">
                              <strong>{template.name}</strong>
                              {template.availabilityLabel && (
                                <span
                                  id={`budget-template-${template.id}-status`}
                                  className="budget-form__template-badge"
                                >
                                  {template.availabilityLabel}
                                </span>
                              )}
                            </span>
                            <span>{template.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {hasTemplateError && (
                    <span id="budget-template-error" className="form-error" role="alert">
                      {errors.templateId}
                    </span>
                  )}
                </fieldset>

                {selectedTemplate && (
                  <section
                    className="budget-form__template-preview"
                    aria-label={`${selectedTemplate.name} template preview`}
                  >
                    <p className="budget-form__template-guidance">{selectedTemplate.guidance}</p>
                    <ul className="budget-form__template-items">
                      {selectedTemplate.categories.map((category) => (
                        <li key={category.name} className="budget-form__template-item">
                          <span>
                            {category.emoji} {category.name}
                          </span>
                          <strong>
                            {category.createBudget === false
                              ? 'Tracked in breakdown'
                              : formatTemplateAmount(category.amountCents)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    <p className="budget-form__template-total">
                      Total starter budget:{' '}
                      <strong>{formatTemplateAmount(templateTotal ?? 0)}</strong>
                    </p>
                    <p className="form-group__help">
                      Creates editable monthly budgets and any supporting categories for this start
                      date.
                    </p>
                  </section>
                )}

                <div className="form-group">
                  <label htmlFor="budget-start-date" className="form-group__label">
                    Start Date
                  </label>
                  <DatePicker
                    id="budget-start-date"
                    className="form-input"
                    value={startDate}
                    onChange={setStartDate}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label
                    htmlFor="budget-category"
                    className="form-group__label form-group__label--required"
                  >
                    Category
                  </label>
                  <select
                    ref={firstInputRef}
                    id="budget-category"
                    className={`form-select${hasCategoryError ? ' form-select--error' : ''}`}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    aria-invalid={hasCategoryError}
                    aria-describedby={hasCategoryError ? 'budget-category-error' : undefined}
                    aria-required="true"
                  >
                    <option value="">Select a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {hasCategoryError && (
                    <span id="budget-category-error" className="form-error" role="alert">
                      {errors.categoryId}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label
                    htmlFor="budget-amount"
                    className="form-group__label form-group__label--required"
                  >
                    Amount
                  </label>
                  <AmountInput
                    id="budget-amount"
                    amountInput={amountInput}
                    className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                    placeholder="$0.00"
                    aria-invalid={hasAmountError}
                    aria-describedby={hasAmountError ? 'budget-amount-error' : undefined}
                    aria-required="true"
                    autoComplete="off"
                  />
                  {hasAmountError && (
                    <span id="budget-amount-error" className="form-error" role="alert">
                      {errors.amount}
                    </span>
                  )}
                  {overAssignmentWarning && !hasAmountError && (
                    <p className="form-group__help" role="status">
                      This would assign {formatCents(overAssignmentWarning.proposedTotalCents)} —{' '}
                      {formatCents(overAssignmentWarning.overByCents)} over expected income.
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="budget-period" className="form-group__label">
                    Period
                  </label>
                  <select
                    id="budget-period"
                    className="form-select"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
                  >
                    {BUDGET_PERIODS.map((periodOption) => (
                      <option key={periodOption.value} value={periodOption.value}>
                        {periodOption.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label
                    style={{
                      display: 'flex',
                      gap: 'var(--spacing-2)',
                      alignItems: 'flex-start',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isRollover}
                      onChange={(e) => setIsRollover(e.target.checked)}
                    />
                    <span>
                      <span className="form-group__label">Envelope / rollover category</span>
                      <span className="form-group__help" style={{ display: 'block' }}>
                        Preserve unused money and carry overspending into the next budget period.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="form-group">
                  <label htmlFor="budget-start-date" className="form-group__label">
                    Start Date
                  </label>
                  <DatePicker
                    id="budget-start-date"
                    className="form-input"
                    value={startDate}
                    onChange={setStartDate}
                  />
                </div>
              </>
            )}
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
              {submitting
                ? creationMode === 'template' && !isEditMode
                  ? 'Creating starter budget…'
                  : isEditMode
                    ? 'Updating…'
                    : 'Creating…'
                : creationMode === 'template' && !isEditMode
                  ? 'Create Starter Budget'
                  : isEditMode
                    ? 'Update Budget'
                    : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
