// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useMemo, useState } from 'react';

import { formatCurrency } from '../../lib/currency';
import {
  buildBusinessExpenseUpdate,
  getBusinessExpenseDefaults,
  getDeductiblePercentForCategory,
  getExpenseCategoryOptions,
  isBusinessExpenseTransaction,
} from '../../lib/mileage';
import type { ExpenseCategory } from '../../lib/mileage';
import type { Transaction } from '../../kmp/bridge';
import './mileage.css';

export interface BusinessExpenseTagProps {
  transaction: Transaction;
  categoryName?: string | null;
  onSave: (update: { tags: string[]; customFields: Record<string, string> | null }) => void;
  disabled?: boolean;
}

export function BusinessExpenseTag({
  transaction,
  categoryName = null,
  onSave,
  disabled = false,
}: BusinessExpenseTagProps) {
  const expenseInput = useMemo(
    () => ({
      id: transaction.id,
      date: transaction.date,
      payee: transaction.payee,
      note: transaction.note,
      amountCents: transaction.amount.amount,
      type: transaction.type,
      tags: transaction.tags,
      customFields: transaction.customFields,
      categoryName,
    }),
    [
      categoryName,
      transaction.amount.amount,
      transaction.customFields,
      transaction.date,
      transaction.id,
      transaction.note,
      transaction.payee,
      transaction.tags,
      transaction.type,
    ],
  );

  const isTagged = useMemo(
    () => transaction.type === 'EXPENSE' && isBusinessExpenseTransaction(expenseInput),
    [expenseInput, transaction.type],
  );
  const defaults = useMemo(() => getBusinessExpenseDefaults(expenseInput), [expenseInput]);
  const categoryOptions = getExpenseCategoryOptions();

  const [enabled, setEnabled] = useState(isTagged);
  const [category, setCategory] = useState<ExpenseCategory>(defaults.category);
  const [businessUsePercent, setBusinessUsePercent] = useState(String(defaults.businessUsePercent));
  const [deductiblePercent, setDeductiblePercent] = useState(String(defaults.deductiblePercent));
  const [note, setNote] = useState(defaults.note);

  useEffect(() => {
    setEnabled(isTagged);
    setCategory(defaults.category);
    setBusinessUsePercent(String(defaults.businessUsePercent));
    setDeductiblePercent(String(defaults.deductiblePercent));
    setNote(defaults.note);
  }, [defaults, isTagged]);

  if (transaction.type !== 'EXPENSE') {
    return null;
  }

  const absoluteAmount = Math.abs(transaction.amount.amount);
  const normalizedBusinessUsePercent = Number.isFinite(Number.parseFloat(businessUsePercent))
    ? Number.parseFloat(businessUsePercent)
    : 0;
  const normalizedDeductiblePercent = Number.isFinite(Number.parseFloat(deductiblePercent))
    ? Number.parseFloat(deductiblePercent)
    : 0;
  const previewAmount = Math.round(
    absoluteAmount * (normalizedBusinessUsePercent / 100) * (normalizedDeductiblePercent / 100),
  );

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(
      buildBusinessExpenseUpdate(expenseInput, {
        enabled,
        category,
        businessUsePercent: Number.parseFloat(businessUsePercent),
        deductiblePercent: Number.parseFloat(deductiblePercent),
        note,
        source: 'manual',
      }),
    );
  }

  return (
    <form className="business-expense-tag" onSubmit={handleSave}>
      <div className="business-expense-tag__title-row">
        <div>
          <h4 className="business-expense-tag__title">Business expense</h4>
          <p className="mileage-card__description">
            Tag this transaction for tax reporting and apply the right deduction percentage.
          </p>
        </div>
        {isTagged ? <span className="business-expense-tag__pill">Tagged</span> : null}
      </div>

      <label className="form-checkbox-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          disabled={disabled}
        />
        Count this as a business expense
      </label>

      {enabled ? (
        <>
          <div className="business-expense-tag__grid">
            <div className="form-group">
              <label className="form-group__label" htmlFor={`expense-category-${transaction.id}`}>
                Category
              </label>
              <select
                id={`expense-category-${transaction.id}`}
                className="form-select"
                value={category}
                onChange={(event) => {
                  const nextCategory = event.target.value as ExpenseCategory;
                  setCategory(nextCategory);
                  setDeductiblePercent(String(getDeductiblePercentForCategory(nextCategory)));
                }}
                disabled={disabled}
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-group__label" htmlFor={`expense-business-${transaction.id}`}>
                Business use %
              </label>
              <input
                id={`expense-business-${transaction.id}`}
                className="form-input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={businessUsePercent}
                onChange={(event) => setBusinessUsePercent(event.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="form-group">
              <label className="form-group__label" htmlFor={`expense-deduction-${transaction.id}`}>
                Deduction %
              </label>
              <input
                id={`expense-deduction-${transaction.id}`}
                className="form-input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={deductiblePercent}
                onChange={(event) => setDeductiblePercent(event.target.value)}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-group__label" htmlFor={`expense-note-${transaction.id}`}>
              Tax note
            </label>
            <input
              id={`expense-note-${transaction.id}`}
              className="form-input"
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Client lunch during onsite visit"
              disabled={disabled}
            />
          </div>
        </>
      ) : null}

      <div className="business-expense-tag__summary" aria-live="polite">
        <span className="business-expense-tag__deduction">Deduction preview: </span>
        {enabled ? formatCurrency(previewAmount) : 'Not deductible'}
      </div>

      <div className="business-expense-tag__actions">
        <button type="submit" className="icon-button" disabled={disabled}>
          Save business tag
        </button>
        {isTagged ? (
          <button
            type="button"
            className="icon-button transaction-item__action--delete"
            onClick={() => onSave(buildBusinessExpenseUpdate(expenseInput, { enabled: false }))}
            disabled={disabled}
          >
            Remove tag
          </button>
        ) : null}
      </div>
    </form>
  );
}
