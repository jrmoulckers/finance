// SPDX-License-Identifier: BUSL-1.1

/**
 * Create bill page with a form for adding new recurring bills and payments.
 *
 * References: issue #1123
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDatabase } from '../db/DatabaseProvider';
import type { Row } from '../db/sqlite-wasm';
import { useBills } from '../hooks';
import type { BillFrequency } from '../kmp/bridge';
import type { CreateBillInput } from '../db/repositories/bills';
import { DatePicker } from '../components/common/DatePicker';
import { Button } from '../components/common/Button';
import { Checkbox } from '../components/common/Checkbox';
import { dollarsToCents, minorUnitStep, normalizeAmountInputValue } from '../lib/currency';

/** Resolve the first available household ID from the local database. */
async function getFirstHouseholdId(db: ReturnType<typeof useDatabase>): Promise<string | null> {
  const row = await db.getOptional<Row>(
    'SELECT id FROM household WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  );
  if (row && typeof row.id === 'string') {
    return row.id;
  }
  return null;
}

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
  const db = useDatabase();
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

  const handleAmountBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const normalized = normalizeAmountInputValue(e.target.value);
    setAmount(normalized);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
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
        const householdId = await getFirstHouseholdId(db);
        if (!householdId) {
          setSubmitError('No household found. Please create a household before adding bills.');
          setSubmitting(false);
          return;
        }

        const input: CreateBillInput = {
          householdId,
          name: name.trim(),
          payee: payee.trim(),
          amount: { amount: dollarsToCents(parseFloat(amount)) },
          dueDate,
          frequency,
          isAutoPay,
          reminderDaysBefore: parseInt(reminderDays, 10) || 0,
          note: note.trim() || null,
        };

        const created = await createBill(input);
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
              onBlur={handleAmountBlur}
              aria-required="true"
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? 'bill-amount-error' : undefined}
              disabled={submitting}
              inputMode="decimal"
              min="0.01"
              step={minorUnitStep()}
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
            <DatePicker
              id="bill-due-date"
              className="form-input"
              value={dueDate}
              onChange={setDueDate}
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
              aria-describedby="bill-frequency-hint"
            >
              <option value="ONE_TIME">One-Time</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Bi-Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </select>
            <p
              id="bill-frequency-hint"
              style={{
                marginTop: 'var(--spacing-1)',
                fontSize: 'var(--type-scale-caption-font-size)',
                color: 'var(--semantic-text-secondary)',
              }}
            >
              Choose One-Time for one-off costs like school fees, birthdays, or sports signups. They
              line up against your paydays in the bill calendar too.
            </p>
          </div>

          {/* Auto-Pay */}
          <div className="form-group" style={{ marginBottom: 'var(--spacing-4)' }}>
            <Checkbox
              label="Auto-pay enabled"
              checked={isAutoPay}
              onChange={(e) => setIsAutoPay(e.target.checked)}
              disabled={submitting}
            />
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
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? 'Creating…' : 'Create Bill'}
            </Button>
            <Button
              as={Link}
              to="/bills"
              variant="secondary"
              aria-disabled={submitting || undefined}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
};

export default CreateBillPage;
