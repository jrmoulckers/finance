// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Checkbox, DateInput } from '../components/common';
import { AmountInput } from '../components/forms/AmountInput';
import { AppIcon } from '../components/icons';
import '../components/forms/forms.css';
import { useAmountInput } from '../hooks/useAmountInput';
import { useAccounts } from '../hooks/useAccounts';
import { useTransactions } from '../hooks/useTransactions';
import { Currencies, type Currency } from '../kmp/bridge';
import type { ExtractedReceiptText } from '../lib/import';
import { webReceiptOcrAdapter } from '../lib/import';
import {
  COGS_BUCKETS,
  COGS_BUCKET_LABELS,
  assignLineItemBucket,
  attachReceiptImage,
  buildReceiptAttachmentStorageKey,
  computeBucketSubtotals,
  createReceiptExpenseDraft,
  detachReceiptImage,
  draftToTransactionCustomFields,
  draftToTransactionTags,
  reconcileDraft,
  toggleLineItemIncluded,
  type CogsBucket,
  type ReceiptExpenseDraft,
  type ReconciliationStatus,
} from '../lib/expenses/receipt-expense-draft';

import '../styles/import.css';

type FlowStatus = 'idle' | 'processing' | 'ready' | 'saved';

function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function generateDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createObjectUrl(file: File): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(file);
  }
  return '';
}

function revokeObjectUrl(url: string | null): void {
  if (url !== null && url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

const RECONCILIATION_LABELS: Readonly<
  Record<ReconciliationStatus, { icon: 'check-circle' | 'alert-triangle'; text: string }>
> = {
  balanced: { icon: 'check-circle', text: 'Mapped items match the receipt total.' },
  over: { icon: 'alert-triangle', text: 'Mapped items are more than the receipt total.' },
  under: { icon: 'alert-triangle', text: 'Mapped items are less than the receipt total.' },
  unmapped: { icon: 'alert-triangle', text: 'No line items are mapped yet.' },
};

/** Web camera/gallery receipt OCR → saved expense + COGS mapping flow. */
export const ReceiptOcrPage: React.FC = () => {
  const accountSelectId = useId();
  const reconciliationId = useId();
  const { accounts } = useAccounts();
  const { createTransaction } = useTransactions();

  const [draft, setDraft] = useState<ReceiptExpenseDraft | null>(null);
  const [merchant, setMerchant] = useState('');
  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    allowNegative: false,
  });
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [status, setStatus] = useState<FlowStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Revoke any outstanding object URL when the component unmounts.
  useEffect(
    () => () => {
      revokeObjectUrl(objectUrlRef.current);
    },
    [],
  );

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  // Working draft keeps line-item edits while sourcing the total/merchant/date
  // from the editable review controls so reconciliation stays reactive.
  const workingDraft = useMemo<ReceiptExpenseDraft | null>(
    () =>
      draft === null ? null : { ...draft, merchant, dateIso: date, totalCents: amountInput.cents },
    [draft, merchant, date, amountInput.cents],
  );

  const subtotals = useMemo(
    () => (workingDraft === null ? null : computeBucketSubtotals(workingDraft)),
    [workingDraft],
  );
  const reconciliation = useMemo(
    () => (workingDraft === null ? null : reconcileDraft(workingDraft)),
    [workingDraft],
  );

  useEffect(() => {
    if (status === 'ready' && reviewHeadingRef.current !== null) {
      reviewHeadingRef.current.focus();
    }
  }, [status]);

  const handleReceiptImage = useCallback(
    (file: File) => {
      setStatus('processing');
      setError(null);
      void webReceiptOcrAdapter
        .extract(file)
        .then((result: ExtractedReceiptText) => {
          const baseDraft = createReceiptExpenseDraft(result, {
            fallbackDateIso: new Date().toISOString().slice(0, 10),
          });

          revokeObjectUrl(objectUrlRef.current);
          const objectUrl = createObjectUrl(file);
          objectUrlRef.current = objectUrl;
          const fileName = file.name.length > 0 ? file.name : `receipt-${Date.now()}.jpg`;
          const attachedDraft = attachReceiptImage(baseDraft, {
            url: objectUrl,
            fileName,
            mimeType: file.type.length > 0 ? file.type : 'image/jpeg',
            sizeBytes: file.size,
            storageKey: buildReceiptAttachmentStorageKey(generateDraftId(), fileName),
            altText:
              baseDraft.merchant.length > 0
                ? `Receipt photo from ${baseDraft.merchant}`
                : 'Captured receipt photo',
          });

          setDraft(attachedDraft);
          setMerchant(attachedDraft.merchant);
          amountInput.setCents(attachedDraft.totalCents);
          setDate(attachedDraft.dateIso);
          setStatus('ready');
        })
        .catch(() => {
          setError('Could not read the receipt image on this device. Please try another photo.');
          setStatus('idle');
        });
    },
    [amountInput],
  );

  const handleBucketChange = useCallback((index: number, bucket: CogsBucket) => {
    setDraft((current) =>
      current === null ? current : assignLineItemBucket(current, index, bucket),
    );
  }, []);

  const handleToggleIncluded = useCallback((index: number) => {
    setDraft((current) => (current === null ? current : toggleLineItemIncluded(current, index)));
  }, []);

  const handleRemoveImage = useCallback(() => {
    revokeObjectUrl(objectUrlRef.current);
    objectUrlRef.current = null;
    setDraft((current) => (current === null ? current : detachReceiptImage(current)));
  }, []);

  const receiptCurrency = (code: string | null, fallback: Currency): Currency => {
    if (code === null) return fallback;
    return Currencies[code as keyof typeof Currencies] ?? fallback;
  };

  const saveExpense = useCallback(async () => {
    if (workingDraft === null) return;
    if (selectedAccount === null) {
      setError('Choose an account before saving.');
      return;
    }
    if (workingDraft.totalCents <= 0 || workingDraft.merchant.trim().length === 0) {
      setError('Review merchant and amount before saving.');
      return;
    }

    const transaction = await createTransaction({
      householdId: selectedAccount.householdId,
      accountId: selectedAccount.id,
      type: 'EXPENSE',
      status: 'CLEARED',
      amount: { amount: workingDraft.totalCents },
      currency: receiptCurrency(workingDraft.currencyCode, selectedAccount.currency),
      payee: workingDraft.merchant,
      note: `Receipt OCR (${Math.round(workingDraft.confidence)}% confidence)`,
      date: workingDraft.dateIso,
      tags: draftToTransactionTags(workingDraft),
      customFields: draftToTransactionCustomFields(workingDraft),
    });

    if (transaction === null) {
      setError('Could not save the receipt expense.');
      return;
    }
    setError(null);
    setStatus('saved');
  }, [workingDraft, selectedAccount, createTransaction]);

  return (
    <div className="import-wizard">
      <h2 className="import-wizard__title">Scan Receipt</h2>
      <p className="import-section-description">
        Take or upload a receipt photo, review the extracted fields, map each line item to a cost
        bucket, and save it as an expense. OCR runs in this browser with Tesseract.js WASM; no
        server OCR fallback is used.
      </p>

      <section aria-labelledby="capture-heading">
        <h3 id="capture-heading" className="import-section-heading">
          Capture receipt
        </h3>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Take or choose receipt photo"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file !== undefined) handleReceiptImage(file);
          }}
        />
      </section>

      {status === 'processing' && (
        <div role="status" aria-live="polite" className="import-progress">
          Reading receipt on device…
        </div>
      )}

      {error !== null && (
        <div className="import-error-banner" role="alert">
          <AppIcon name="alert-triangle" />
          {error}
        </div>
      )}

      {(status === 'ready' || status === 'saved') && workingDraft !== null && (
        <section aria-labelledby="review-heading">
          <h3
            id="review-heading"
            className="import-section-heading"
            tabIndex={-1}
            ref={reviewHeadingRef}
          >
            Review &amp; save as expense
          </h3>

          <div className="import-account-selector">
            <label htmlFor={accountSelectId} className="import-account-selector__label">
              Account
            </label>
            <select
              id={accountSelectId}
              className="form-select"
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              <option value="">Select an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <label className="import-account-selector__label">
            Merchant
            <input value={merchant} onChange={(event) => setMerchant(event.target.value)} />
          </label>
          <label className="import-account-selector__label" htmlFor="receipt-amount">
            Amount
          </label>
          <AmountInput
            id="receipt-amount"
            amountInput={amountInput}
            className="form-input"
            displayLabel="Receipt total"
            aria-label="Amount"
          />
          <label className="import-account-selector__label">
            Date
            <DateInput value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <p>OCR confidence: {Math.round(workingDraft.confidence)}%</p>

          {workingDraft.attachment !== null && (
            <div className="receipt-attachment">
              <h4 id="receipt-image-heading" className="import-section-heading">
                Receipt image
              </h4>
              {workingDraft.attachment.url.length > 0 ? (
                <img
                  className="receipt-attachment__image"
                  src={workingDraft.attachment.url}
                  alt={workingDraft.attachment.altText}
                />
              ) : (
                <p>{workingDraft.attachment.fileName} attached.</p>
              )}
              <button type="button" className="import-skip-all-button" onClick={handleRemoveImage}>
                Remove receipt image
              </button>
            </div>
          )}

          {workingDraft.lineItems.length > 0 && (
            <fieldset className="receipt-items">
              <legend>Map line items to cost buckets</legend>
              <table className="import-mapping-table receipt-items__table">
                <thead>
                  <tr>
                    <th scope="col">Include</th>
                    <th scope="col">Item</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Cost bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {workingDraft.lineItems.map((item, index) => {
                    const selectId = `${reconciliationId}-bucket-${index}`;
                    return (
                      <tr key={`${item.description}-${index}`}>
                        <td>
                          <Checkbox
                            checked={item.included}
                            aria-label={`Include ${item.description}`}
                            onChange={() => handleToggleIncluded(index)}
                          />
                        </td>
                        <td>{item.description}</td>
                        <td>{formatMoney(item.amountCents)}</td>
                        <td>
                          <label className="sr-only" htmlFor={selectId}>
                            Cost bucket for {item.description}
                          </label>
                          <select
                            id={selectId}
                            className="form-select"
                            value={item.bucket}
                            disabled={!item.included}
                            onChange={(event) =>
                              handleBucketChange(index, event.target.value as CogsBucket)
                            }
                          >
                            {COGS_BUCKETS.map((bucket) => (
                              <option key={bucket} value={bucket}>
                                {COGS_BUCKET_LABELS[bucket]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </fieldset>
          )}

          {subtotals !== null && (
            <div className="receipt-subtotals">
              <h4 id="subtotal-heading" className="import-section-heading">
                Per-bucket subtotals
              </h4>
              <dl className="receipt-subtotals__list">
                {COGS_BUCKETS.map((bucket) => (
                  <div key={bucket} className="receipt-subtotals__row">
                    <dt>{COGS_BUCKET_LABELS[bucket]}</dt>
                    <dd>{formatMoney(subtotals[bucket])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {reconciliation !== null && (
            <div
              id={reconciliationId}
              role="status"
              aria-live="polite"
              className={`receipt-reconciliation receipt-reconciliation--${reconciliation.status}`}
            >
              <AppIcon name={RECONCILIATION_LABELS[reconciliation.status].icon} />
              <span className="receipt-reconciliation__text">
                {RECONCILIATION_LABELS[reconciliation.status].text} Mapped{' '}
                {formatMoney(reconciliation.mappedTotalCents)} of{' '}
                {formatMoney(reconciliation.receiptTotalCents)}
                {reconciliation.differenceCents !== 0 &&
                  ` (difference ${formatMoney(reconciliation.differenceCents)})`}
                .
              </span>
            </div>
          )}

          <button
            type="button"
            className="form-button"
            onClick={saveExpense}
            disabled={status === 'saved'}
          >
            {status === 'saved' ? 'Saved' : 'Save as expense'}
          </button>
        </section>
      )}
    </div>
  );
};

export default ReceiptOcrPage;
