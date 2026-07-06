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
import type { Account } from '../../kmp/bridge';
import { CurrencyDisplay } from '../common';
import { AmountInput } from '../forms/AmountInput';
import '../forms/forms.css';

export interface InvoicePaymentDialogProps {
  isOpen: boolean;
  invoice: Invoice | null;
  /** Accounts the cash inflow can be deposited into (#3266). */
  accounts: Account[];
  onSubmit: (paymentCents: number, paidDate: string, accountId: string) => void;
  onCancel: () => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InvoicePaymentDialog({
  isOpen,
  invoice,
  accounts,
  onSubmit,
  onCancel,
}: InvoicePaymentDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const amountErrorId = useId();
  const accountErrorId = useId();
  const titleId = useId();

  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    allowNegative: false,
  });
  const [paidDate, setPaidDate] = useState(todayIsoDate);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  useEffect(() => {
    if (!isOpen) return;

    amountInput.reset(0);
    setPaidDate(todayIsoDate());
    setAmountError(null);
    setAccountError(null);
    setAccountId(invoice?.paymentAccountId ?? accounts[0]?.id ?? '');

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
      if (!accountId) {
        setAmountError(null);
        setAccountError('Select an account to deposit the payment into.');
        return;
      }

      setAmountError(null);
      setAccountError(null);
      onSubmit(paymentCents, paidDate, accountId);
    },
    [accountId, amountInput.cents, invoice, onSubmit, paidDate],
  );

  if (!isOpen || invoice === null) {
    return null;
  }

  const outstanding = invoiceOutstandingCents(invoice);
  const projectedOutstanding = Math.max(0, outstanding - amountInput.cents);
  const hasAmountError = amountError !== null;
  const hasAccountError = accountError !== null;
  const noAccounts = accounts.length === 0;
  const amountId = `${titleId}-amount`;
  const dateInputId = `${titleId}-date`;
  const accountInputId = `${titleId}-account`;

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

            <div className="form-group">
              <label
                htmlFor={accountInputId}
                className="form-group__label form-group__label--required"
              >
                Deposit account
              </label>
              <select
                id={accountInputId}
                className={`form-input${hasAccountError ? ' form-input--error' : ''}`}
                value={accountId}
                disabled={noAccounts}
                aria-invalid={hasAccountError}
                aria-describedby={hasAccountError ? accountErrorId : undefined}
                aria-required="true"
                onChange={(event) => {
                  setAccountId(event.target.value);
                  setAccountError(null);
                }}
              >
                {noAccounts ? (
                  <option value="">No accounts available</option>
                ) : (
                  accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.currency.code}
                    </option>
                  ))
                )}
              </select>
              <p className="form-hint">
                Records the payment as a cash inflow so it hits your balance and net worth.
              </p>
              {hasAccountError && (
                <span id={accountErrorId} className="form-error" role="alert">
                  {accountError}
                </span>
              )}
              {noAccounts && (
                <span className="form-error" role="alert">
                  Add an account first to record this payment as a cash inflow.
                </span>
              )}
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
            <button
              type="submit"
              className="form-button form-button--primary"
              disabled={noAccounts}
            >
              Record payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InvoicePaymentDialog;
