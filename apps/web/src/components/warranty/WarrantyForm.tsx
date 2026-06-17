// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Transaction } from '../../kmp/bridge';
import {
  buildWarrantyDraftFromTransaction,
  deleteWarrantyEntry,
  getWarrantyStatus,
  saveWarrantyEntry,
  suggestReturnWindow,
  useWarrantyEntry,
} from '../../lib/warranty';

export interface WarrantyFormProps {
  readonly transaction: Transaction;
  readonly categoryName?: string;
}

interface WarrantyFormState {
  readonly itemName: string;
  readonly merchantName: string;
  readonly warrantyExpiryDate: string;
  readonly returnWindowEndDate: string;
  readonly receiptPhotoUrl: string;
  readonly notes: string;
}

function createInitialState(
  transaction: Transaction,
  categoryName: string | undefined,
  existingEntry: ReturnType<typeof useWarrantyEntry>,
): WarrantyFormState {
  const suggestion = suggestReturnWindow(
    existingEntry?.merchantName ?? transaction.payee ?? transaction.counterpartyName,
    transaction.date,
    categoryName,
  );

  return {
    itemName: existingEntry?.itemName ?? buildWarrantyDraftFromTransaction(transaction).itemName,
    merchantName:
      existingEntry?.merchantName ??
      buildWarrantyDraftFromTransaction(transaction).merchantName ??
      '',
    warrantyExpiryDate: existingEntry?.warrantyExpiryDate ?? '',
    returnWindowEndDate: existingEntry?.returnWindowEndDate ?? suggestion.endDate,
    receiptPhotoUrl: existingEntry?.receiptPhotoUrl ?? '',
    notes: existingEntry?.notes ?? '',
  };
}

function statusCopy(status: ReturnType<typeof getWarrantyStatus> | null): string {
  switch (status) {
    case 'expiring-soon':
      return 'Expiring soon';
    case 'expired':
      return 'Expired';
    case 'active':
      return 'Active';
    default:
      return 'Not tracked';
  }
}

export const WarrantyForm: React.FC<WarrantyFormProps> = ({ transaction, categoryName }) => {
  const existingEntry = useWarrantyEntry(transaction.id);
  const [formState, setFormState] = useState<WarrantyFormState>(() =>
    createInitialState(transaction, categoryName, existingEntry),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setFormState(createInitialState(transaction, categoryName, existingEntry));
    setErrorMessage(null);
  }, [categoryName, existingEntry, transaction]);

  const suggestion = useMemo(
    () =>
      suggestReturnWindow(
        formState.merchantName || transaction.payee || transaction.counterpartyName,
        transaction.date,
        categoryName,
      ),
    [
      categoryName,
      formState.merchantName,
      transaction.counterpartyName,
      transaction.date,
      transaction.payee,
    ],
  );

  const currentStatus = existingEntry ? getWarrantyStatus(existingEntry) : null;
  const amountLabel = (Math.abs(transaction.amount.amount) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: transaction.currency.code,
  });

  const updateField = useCallback((field: keyof WarrantyFormState, value: string) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage(null);
      setStatusMessage(null);

      const hasAnyDetails = [
        formState.warrantyExpiryDate,
        formState.returnWindowEndDate,
        formState.receiptPhotoUrl.trim(),
        formState.notes.trim(),
      ].some(Boolean);

      if (!hasAnyDetails) {
        setErrorMessage(
          'Add at least one deadline, receipt link, or note to start tracking this purchase.',
        );
        return;
      }

      saveWarrantyEntry(
        buildWarrantyDraftFromTransaction(transaction, {
          itemName:
            formState.itemName.trim() || buildWarrantyDraftFromTransaction(transaction).itemName,
          merchantName: formState.merchantName.trim() || null,
          warrantyExpiryDate: formState.warrantyExpiryDate || null,
          returnWindowEndDate: formState.returnWindowEndDate || null,
          receiptPhotoUrl: formState.receiptPhotoUrl.trim() || null,
          notes: formState.notes.trim() || null,
        }),
      );

      setStatusMessage(existingEntry ? 'Warranty details updated.' : 'Warranty details saved.');
    },
    [existingEntry, formState, transaction],
  );

  const handleDelete = useCallback(() => {
    deleteWarrantyEntry(transaction.id);
    setFormState(createInitialState(transaction, categoryName, null));
    setErrorMessage(null);
    setStatusMessage('Warranty details removed.');
  }, [categoryName, transaction]);

  return (
    <article
      className="card"
      aria-label="Warranty and return tracking"
      style={{ marginBottom: 'var(--spacing-6)' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-3)',
          flexWrap: 'wrap',
          marginBottom: 'var(--spacing-3)',
        }}
      >
        <div>
          <h3 className="card__title" style={{ marginBottom: 'var(--spacing-1)' }}>
            Warranty & returns
          </h3>
          <p style={{ margin: 0, color: 'var(--semantic-text-secondary)' }}>
            Purchased on {transaction.date} · {amountLabel}
          </p>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.25rem 0.65rem',
            borderRadius: '999px',
            backgroundColor:
              currentStatus === 'expired'
                ? 'rgba(127, 29, 29, 0.12)'
                : currentStatus === 'expiring-soon'
                  ? 'rgba(146, 64, 14, 0.12)'
                  : 'rgba(21, 128, 61, 0.12)',
            color:
              currentStatus === 'expired'
                ? '#991b1b'
                : currentStatus === 'expiring-soon'
                  ? '#9a3412'
                  : '#166534',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          {statusCopy(currentStatus)}
        </span>
      </div>

      <div
        style={{
          marginBottom: 'var(--spacing-4)',
          padding: 'var(--spacing-3)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--semantic-background-secondary)',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>Suggested return policy</p>
        <p style={{ margin: 'var(--spacing-1) 0', color: 'var(--semantic-text-secondary)' }}>
          {suggestion.label}: {suggestion.days} days, through {suggestion.endDate}
        </p>
        {formState.returnWindowEndDate !== suggestion.endDate ? (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => updateField('returnWindowEndDate', suggestion.endDate)}
          >
            Use suggestion
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--spacing-4)',
          }}
        >
          <label style={{ display: 'grid', gap: 'var(--spacing-1)' }}>
            <span>Item label</span>
            <input
              type="text"
              className="form-input"
              value={formState.itemName}
              onChange={(event) => updateField('itemName', event.target.value)}
              placeholder="Laptop, headphones, sofa..."
            />
          </label>
          <label style={{ display: 'grid', gap: 'var(--spacing-1)' }}>
            <span>Merchant</span>
            <input
              type="text"
              className="form-input"
              value={formState.merchantName}
              onChange={(event) => updateField('merchantName', event.target.value)}
              placeholder="Amazon, Costco..."
            />
          </label>
          <label style={{ display: 'grid', gap: 'var(--spacing-1)' }}>
            <span>Warranty expires</span>
            <input
              type="date"
              className="form-input"
              value={formState.warrantyExpiryDate}
              onChange={(event) => updateField('warrantyExpiryDate', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 'var(--spacing-1)' }}>
            <span>Return window ends</span>
            <input
              type="date"
              className="form-input"
              value={formState.returnWindowEndDate}
              onChange={(event) => updateField('returnWindowEndDate', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 'var(--spacing-1)', gridColumn: '1 / -1' }}>
            <span>Receipt photo URL</span>
            <input
              type="url"
              className="form-input"
              value={formState.receiptPhotoUrl}
              onChange={(event) => updateField('receiptPhotoUrl', event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label style={{ display: 'grid', gap: 'var(--spacing-1)', gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <textarea
              className="form-input"
              rows={4}
              value={formState.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="Serial number, coverage details, repair contact, return reason..."
            />
          </label>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            style={{ color: '#b91c1c', marginTop: 'var(--spacing-3)', marginBottom: 0 }}
          >
            {errorMessage}
          </p>
        ) : null}
        {statusMessage ? (
          <p
            role="status"
            style={{ color: '#166534', marginTop: 'var(--spacing-3)', marginBottom: 0 }}
          >
            {statusMessage}
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-2)',
            flexWrap: 'wrap',
            marginTop: 'var(--spacing-4)',
          }}
        >
          <button type="submit" className="btn btn--primary">
            {existingEntry ? 'Update warranty' : 'Save warranty'}
          </button>
          {existingEntry ? (
            <button type="button" className="btn btn--secondary" onClick={handleDelete}>
              Remove tracking
            </button>
          ) : null}
        </div>
      </form>
    </article>
  );
};
