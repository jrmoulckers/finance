// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible dialog for recording a full or partial payment against an invoice.
 *
 * References: issue #3224
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { useAmountInput } from '../../hooks/useAmountInput';
import { invoiceOutstandingCents, type Invoice } from '../../lib/analytics/invoices';
import { CurrencyDisplay } from '../common';
import { AmountInput } from '../forms/AmountInput';
import '../forms/forms.css';

export interface InvoicePaymentDialogProps {
  isOpen: boolean;
  invoice: Invoice | null;
  onSubmit: (paymentCents: number, paidDate: string) => void;
  onCancel: () => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InvoicePaymentDialog({
  isOpen,
  invoice,
  onSubmit,
  onCancel,
}: InvoicePaymentDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const amountErrorId = useId();
  const titleId = useId();

  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    allowNegative: false,
  });
  const [paidDate, setPaidDate] = useState(todayIsoDate);
  const [amountError, setAmountError] = useState<string | null>(null);

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  useEffect(() => {
    if (!isOpen) return;

    amountInput.reset(0);
    setPaidDate(todayIsoDate());
    setAmountError(null);

    const id = requestAnimationFrame(() => {
      amountInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(id);
  }, [invoice?.id, isOpen]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!invoice) return;

      const paymentCents = amountInput.cents;
      const outstanding = invoiceOutstandingCents(invoice);

      if (paymentCents <= 0) {
        setAmountError('Enter a payment amount greater than zero.');
        return;
      }
      if (paymentCents > outstanding) {
        setAmountError('Payment cannot exceed the outstanding balance.');
        return;
      }

      setAmountError(null);
      onSubmit(paymentCents, paidDate);
    },
    [amountInput.cents, invoice, onSubmit, paidDate],
  );

  if (!isOpen || invoice === null) {
    return null;
  }

  const outstanding = invoiceOutstandingCents(invoice);
  const projectedOutstanding = Math.max(0, outstanding - amountInput.cents);
  const hasAmountError = amountError !== null;
  const amountId = `${titleId}-amount`;
  const dateInputId = `${titleId}-date`;

  return (
    <div className="form-dialog" role="presentation" onKeyDown={handleKeyDown}>
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />
      <div
        ref={panelRef}
        className="form-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="form-dialog__title">
          Record payment for {invoice.clientName}
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-3)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          <div>
            <p className="card__title">Outstanding now</p>
            <p className="card__value">
              <CurrencyDisplay amount={outstanding} />
            </p>
          </div>
          <div>
            <p className="card__title">After payment</p>
            <p className="card__value">
              <CurrencyDisplay amount={projectedOutstanding} />
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            <div className="form-group">
              <label htmlFor={amountId} className="form-group__label form-group__label--required">
                Payment amount
              </label>
              <AmountInput
                ref={amountInputRef}
                id={amountId}
                amountInput={amountInput}
                className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                placeholder={amountInput.placeholderValue}
                displayLabel="Entered payment amount"
                aria-invalid={hasAmountError}
                aria-describedby={hasAmountError ? amountErrorId : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasAmountError && (
                <span id={amountErrorId} className="form-error" role="alert">
                  {amountError}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor={dateInputId} className="form-group__label">
                Payment date
              </label>
              <input
                id={dateInputId}
                type="date"
                className="form-input"
                value={paidDate}
                max={todayIsoDate()}
                onChange={(event) => setPaidDate(event.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button type="submit" className="form-button form-button--primary">
              Record payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InvoicePaymentDialog;
