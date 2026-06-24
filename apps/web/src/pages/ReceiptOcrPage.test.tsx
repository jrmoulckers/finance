// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ReceiptOcrPage (#2183).
 *
 * Mocks the `useAccounts` / `useTransactions` hooks (not repositories) and the
 * on-device OCR adapter, per project conventions. Exercises the full
 * receipt → expense flow: capture, review, COGS mapping, image attachment, and
 * saving the expense through the transactions mutation hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Account } from '../kmp/bridge';
import type { ExtractedReceiptText } from '../lib/import';

vi.mock('../hooks/useAccounts', () => ({ useAccounts: vi.fn() }));
vi.mock('../hooks/useTransactions', () => ({ useTransactions: vi.fn() }));
vi.mock('../lib/import', () => ({ webReceiptOcrAdapter: { extract: vi.fn() } }));

import { useAccounts } from '../hooks/useAccounts';
import { useTransactions } from '../hooks/useTransactions';
import { webReceiptOcrAdapter } from '../lib/import';
import { ReceiptOcrPage } from './ReceiptOcrPage';

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseTransactions = vi.mocked(useTransactions);
const mockedExtract = vi.mocked(webReceiptOcrAdapter.extract);

const account: Account = {
  id: 'acct-1',
  householdId: 'hh-1',
  name: 'Food Truck Checking',
  type: 'CHECKING',
  currency: { code: 'USD', decimalPlaces: 2 },
  currentBalance: { amount: 0 },
  isArchived: false,
  sortOrder: 0,
  icon: null,
  color: null,
} as Account;

const ocrResult: ExtractedReceiptText = {
  merchant: 'Restaurant Depot',
  date: '2026-02-14',
  total: 5000,
  currency: 'USD',
  lineItems: [
    {
      description: 'Ground beef',
      total: 2500,
      quantity: null,
      suggestedCategory: null,
      suggestedCategoryId: null,
      categoryAccepted: false,
    },
    {
      description: 'Paper cups',
      total: 1000,
      quantity: null,
      suggestedCategory: null,
      suggestedCategoryId: null,
      categoryAccepted: false,
    },
  ],
  rawText: 'RESTAURANT DEPOT',
  confidence: 80,
};

const createTransaction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-receipt');
  globalThis.URL.revokeObjectURL = vi.fn();

  mockedUseAccounts.mockReturnValue({
    accounts: [account],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  } as unknown as ReturnType<typeof useAccounts>);

  createTransaction.mockReturnValue({ id: 'txn-1' });
  mockedUseTransactions.mockReturnValue({
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction,
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  });

  mockedExtract.mockResolvedValue(ocrResult);
});

async function uploadReceipt(): Promise<void> {
  const user = userEvent.setup();
  const file = new File(['image-bytes'], 'receipt.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Take or choose receipt photo');
  await user.upload(input, file);
  await screen.findByRole('heading', { name: /review & save as expense/i });
}

describe('ReceiptOcrPage', () => {
  it('extracts a receipt and surfaces the review + COGS mapping UI', async () => {
    render(<ReceiptOcrPage />);
    await uploadReceipt();

    // Line items are mapped to default buckets.
    expect(screen.getByLabelText('Cost bucket for Ground beef')).toHaveValue('COGS');
    expect(screen.getByLabelText('Cost bucket for Paper cups')).toHaveValue('supplies');

    // Receipt image is attached with an accessible alt.
    const image = screen.getByRole('img', { name: /receipt photo from restaurant depot/i });
    expect(image).toHaveAttribute('src', 'blob:mock-receipt');
  });

  it('announces a reconciliation mismatch with text (not color alone)', async () => {
    render(<ReceiptOcrPage />);
    await uploadReceipt();

    // Mapped items (2500 + 1000 = 3500) are less than the 5000 total.
    const status = screen.getByText(/less than the receipt total/i);
    expect(status).toBeInTheDocument();
    const liveRegion = status.closest('[role="status"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('lets the user remap a line item to a different bucket', async () => {
    const user = userEvent.setup();
    render(<ReceiptOcrPage />);
    await uploadReceipt();

    await user.selectOptions(screen.getByLabelText('Cost bucket for Paper cups'), 'inventory');
    expect(screen.getByLabelText('Cost bucket for Paper cups')).toHaveValue('inventory');
  });

  it('saves the expense through the transactions hook with itemised COGS data', async () => {
    const user = userEvent.setup();
    render(<ReceiptOcrPage />);
    await uploadReceipt();

    await user.selectOptions(screen.getByLabelText('Account'), 'acct-1');
    await user.click(screen.getByRole('button', { name: /save as expense/i }));

    expect(createTransaction).toHaveBeenCalledTimes(1);
    const input = createTransaction.mock.calls[0][0];
    expect(input).toMatchObject({
      accountId: 'acct-1',
      householdId: 'hh-1',
      type: 'EXPENSE',
      amount: { amount: 5000 },
      payee: 'Restaurant Depot',
      date: '2026-02-14',
    });
    expect(input.tags).toEqual(expect.arrayContaining(['receipt', 'pnl:cogs', 'supplies']));
    expect(input.customFields.receiptImageUrl).toBe('blob:mock-receipt');
    expect(input.customFields.receiptReconciliationStatus).toBe('under');

    const items = JSON.parse(input.customFields.receiptLineItems) as Array<{ bucket: string }>;
    expect(items).toHaveLength(2);

    // Button reflects the saved state.
    expect(screen.getByRole('button', { name: /saved/i })).toBeDisabled();
  });

  it('blocks saving until an account is chosen', async () => {
    const user = userEvent.setup();
    render(<ReceiptOcrPage />);
    await uploadReceipt();

    await user.click(screen.getByRole('button', { name: /save as expense/i }));

    expect(createTransaction).not.toHaveBeenCalled();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/choose an account/i)).toBeInTheDocument();
  });
});
