// SPDX-License-Identifier: BUSL-1.1

import React, { useId, useMemo, useState } from 'react';
import { DatePicker } from '../components/common/DatePicker';
import { AmountInput } from '../components/forms/AmountInput';
import { AppIcon } from '../components/icons';
import '../components/forms/forms.css';
import { useAmountInput } from '../hooks/useAmountInput';
import { useAccounts } from '../hooks/useAccounts';
import { useTransactions } from '../hooks/useTransactions';
import { Currencies, type Currency } from '../kmp/bridge';
import type { ExtractedReceiptLineItem, ExtractedReceiptText } from '../lib/import';
import { webReceiptOcrAdapter } from '../lib/import';

import '../styles/import.css';

interface EditableReceiptLineItem extends ExtractedReceiptLineItem {
  readonly accepted: boolean;
}

const emptyReceipt: ExtractedReceiptText = {
  merchant: null,
  date: null,
  total: null,
  currency: null,
  lineItems: [],
  rawText: '',
  confidence: 0,
};

/** Web camera/gallery receipt OCR flow using on-device Tesseract.js WASM. */
export const ReceiptOcrPage: React.FC = () => {
  const accountSelectId = useId();
  const { accounts } = useAccounts();
  const { createTransaction } = useTransactions();
  const [receipt, setReceipt] = useState<ExtractedReceiptText>(emptyReceipt);
  const [items, setItems] = useState<readonly EditableReceiptLineItem[]>([]);
  const [merchant, setMerchant] = useState('');
  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    allowNegative: false,
  });
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const handleReceiptImage = (file: File) => {
    setStatus('processing');
    setError(null);
    void webReceiptOcrAdapter
      .extract(file)
      .then((result) => {
        setReceipt(result);
        setMerchant(result.merchant ?? '');
        amountInput.setCents(result.total ?? 0);
        setDate(result.date ?? new Date().toISOString().slice(0, 10));
        setItems(result.lineItems.map((item) => ({ ...item, accepted: true })));
        setStatus('ready');
      })
      .catch(() => {
        setError('Could not read the receipt image on this device. Please try another photo.');
        setStatus('idle');
      });
  };

  const toggleLineItem = (index: number) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, accepted: !item.accepted } : item,
      ),
    );
  };

  const receiptCurrency = (code: string | null, fallback: Currency): Currency => {
    if (code === null) return fallback;
    return Currencies[code as keyof typeof Currencies] ?? fallback;
  };

  const saveTransaction = () => {
    if (selectedAccount === null) {
      setError('Choose an account before saving.');
      return;
    }

    const totalCents = amountInput.cents;
    if (totalCents <= 0 || merchant.trim().length === 0) {
      setError('Review merchant and amount before saving.');
      return;
    }

    const acceptedItems = items.filter((item) => item.accepted);
    const transaction = createTransaction({
      householdId: selectedAccount.householdId,
      accountId: selectedAccount.id,
      type: 'EXPENSE',
      status: 'CLEARED',
      amount: { amount: totalCents },
      currency: receiptCurrency(receipt.currency, selectedAccount.currency),
      payee: merchant,
      note: `Receipt OCR (${Math.round(receipt.confidence)}% confidence)`,
      date,
      tags: ['receipt'],
      customFields: {
        receiptRawText: receipt.rawText,
        receiptLineItems: JSON.stringify(acceptedItems),
      },
    });

    if (transaction === null) {
      setError('Could not save the receipt transaction.');
      return;
    }
    setStatus('saved');
  };

  return (
    <div className="import-wizard">
      <h2 className="import-wizard__title">Scan Receipt</h2>
      <p className="import-section-description">
        Take or upload a receipt photo. OCR runs in this browser with Tesseract.js WASM; no server
        OCR fallback is used.
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

      {(status === 'ready' || status === 'saved') && (
        <section aria-labelledby="quick-entry-heading">
          <h3 id="quick-entry-heading" className="import-section-heading">
            Quick entry
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
            <DatePicker value={date} onChange={setDate} />
          </label>
          <p>OCR confidence: {Math.round(receipt.confidence)}%</p>

          {items.length > 0 && (
            <fieldset>
              <legend>Itemized split suggestions</legend>
              {items.map((item, index) => (
                <label key={`${item.description}-${index}`}>
                  <input
                    type="checkbox"
                    checked={item.accepted}
                    onChange={() => toggleLineItem(index)}
                  />
                  {item.description} — ${(item.total / 100).toFixed(2)}
                  {item.suggestedCategory === null ? '' : ` (${item.suggestedCategory})`}
                </label>
              ))}
            </fieldset>
          )}

          <button type="button" onClick={saveTransaction} disabled={status === 'saved'}>
            {status === 'saved' ? 'Saved' : 'Save transaction'}
          </button>
        </section>
      )}
    </div>
  );
};

export default ReceiptOcrPage;
