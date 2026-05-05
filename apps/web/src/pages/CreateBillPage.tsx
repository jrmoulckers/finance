// SPDX-License-Identifier: BUSL-1.1

/**
 * Create bill page with a form for adding new recurring bills and payments.
 *
 * References: issue #1123
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBills } from '../hooks';
import type { BillFrequency } from '../kmp/bridge';
import type { CreateBillInput } from '../db/repositories/bills';

/** Form validation error shape. */
interface FormErrors {
  name?: string;
  payee?: string;
  amount?: string;
  dueDate?: string;
}

/** Validate form fields. */
function validate(fields: {
  name: string;
  payee: string;
  amount: string;
  dueDate: string;
}): FormErrors {
  const errors: FormErrors = {};

  if (!fields.name.trim()) {
    errors.name = 'Bill name is required.';
  }

  if (!fields.payee.trim()) {
    errors.payee = 'Payee is required.';
  }

  const parsedAmount = parseFloat(fields.amount);
  if (!fields.amount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
    errors.amount = 'Amount must be a positive number.';
  }

  if (!fields.dueDate.trim()) {
    errors.dueDate = 'Due date is required.';
  }

  return errors;
}

/** Create bill page component. */
export const CreateBillPage: React.FC = () => {
  const navigate = useNavigate();
  const { createBill } = useBills();

  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [frequency, setFrequency] = useState<BillFrequency>('MONTHLY');
  const [isAutoPay, setIsAutoPay] = useState(false);
  const [reminderDays, setReminderDays] = useState('3');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Focus first field on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      nameRef.current?.focus();
    });
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const validationErrors = validate({ name, payee, amount, dueDate });
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      setErrors({});
      setSubmitting(true);

      try {
        const input: CreateBillInput = {
          householdId: crypto.randomUUID(), // TODO: derive from auth context
          name: name.trim(),
          payee: payee.trim(),
          amount: { amount: Math.round(parseFloat(amount) * 100) },
          dueDate,
          frequency,
          isAutoPay,
          reminderDaysBefore: parseInt(reminderDays, 10) || 0,
          note: note.trim() || null,
        };

        const created = createBill(input);
        if (created) {
          navigate('/bills');
        } else {
          setSubmitError('Failed to create bill. Please try again.');
        }
      } catch {
        setSubmitError('An unexpected error occurred.');
      } finally {
        setSubmitting(false);
      }
    },
    [name, payee, amount, dueDate, frequency, isAutoPay, reminderDays, note, createBill, navigate],
  );

  return (
    <>
      <div style={{ marginBottom: 'var(--spacing-4)' }}>
        <Link to="/bills" aria-label="Back to bills">
          ← Back to Bills
        </Link>
      </div>

      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          Add New Bill
        </h2>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        {submitError && (
          <div
            role="alert"
            className="form-banner-error"
            style={{ marginBottom: 'var(--spacing-4)' }}
          >
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <label htmlFor="bill-name" className="form-group__label form-group__label--required">
              Bill Name
            </label>
            <input
              ref={nameRef}
              id="bill-name"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'bill-name-error' : undefined}
              disabled={submitting}
              placeholder="e.g., Electric Bill"
            />
            {errors.name && (
              <p id="bill-name-error" role="alert" className="form-error">
                {errors.name}
              </p>
            )}
          </div>

          {/* Payee */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <label htmlFor="bill-payee" className="form-group__label form-group__label--required">
              Payee
            </label>
            <input
              id="bill-payee"
              type="text"
              className="form-input"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.payee}
              aria-describedby={errors.payee ? 'bill-payee-error' : undefined}
              disabled={submitting}
              placeholder="e.g., Power Company"
            />
            {errors.payee && (
              <p id="bill-payee-error" role="alert" className="form-error">
                {errors.payee}
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <label htmlFor="bill-amount" className="form-group__label form-group__label--required">
              Amount ($)
            </label>
            <input
              id="bill-amount"
              type="number"
              className="form-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? 'bill-amount-error' : undefined}
              disabled={submitting}
              min="0.01"
              step="0.01"
              placeholder="0.00"
            />
            {errors.amount && (
              <p id="bill-amount-error" role="alert" className="form-error">
                {errors.amount}
              </p>
            )}
          </div>

          {/* Due Date */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <label
              htmlFor="bill-due-date"
              className="form-group__label form-group__label--required"
            >
              Due Date
            </label>
            <input
              id="bill-due-date"
              type="date"
              className="form-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.dueDate}
              aria-describedby={errors.dueDate ? 'bill-due-date-error' : undefined}
              disabled={submitting}
            />
            {errors.dueDate && (
              <p id="bill-due-date-error" role="alert" className="form-error">
                {errors.dueDate}
              </p>
            )}
          </div>

          {/* Frequency */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <label htmlFor="bill-frequency" className="form-group__label">
              Frequency
            </label>
            <select
              id="bill-frequency"
              className="form-input"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as BillFrequency)}
              disabled={submitting}
            >
              <option value="ONE_TIME">One-Time</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Bi-Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>

          {/* Auto-Pay */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-2)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={isAutoPay}
                onChange={(e) => setIsAutoPay(e.target.checked)}
                disabled={submitting}
              />
              Auto-pay enabled
            </label>
          </div>

          {/* Reminder Days */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <label htmlFor="bill-reminder-days" className="form-group__label">
              Remind me (days before)
            </label>
            <input
              id="bill-reminder-days"
              type="number"
              className="form-input"
              value={reminderDays}
              onChange={(e) => setReminderDays(e.target.value)}
              disabled={submitting}
              min="0"
              max="30"
            />
          </div>

          {/* Note */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-6)' }}>
            <label htmlFor="bill-note" className="form-group__label">
              Note (optional)
            </label>
            <textarea
              id="bill-note"
              className="form-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Add any notes about this bill..."
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
            <button
              type="submit"
              className="form-button form-button--primary"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'Creating…' : 'Create Bill'}
            </button>
            <Link
              to="/bills"
              className="form-button"
              style={{ textDecoration: 'none' }}
              aria-disabled={submitting}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
};

export default CreateBillPage;
