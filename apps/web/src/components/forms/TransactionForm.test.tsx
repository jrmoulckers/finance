// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Category, Transaction } from '../../kmp/bridge';
import { validateTransactionSplits } from '../../lib/transactions/splits';
import { TransactionForm, type TransactionFormProps } from './TransactionForm';

vi.mock('../../accessibility/aria', () => ({
  announce: vi.fn(),
  useFocusTrap: vi.fn(),
}));

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

const accounts: Account[] = [
  {
    id: 'account-1',
    householdId: 'household-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 520000 },
    isArchived: false,
    sortOrder: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncMetadata,
  },
  {
    id: 'account-2',
    householdId: 'household-1',
    name: 'Savings',
    type: 'SAVINGS',
    currency: { code: 'EUR', decimalPlaces: 2 },
    currentBalance: { amount: 180000 },
    isArchived: false,
    sortOrder: 2,
    icon: 'wallet',
    color: '#16A34A',
    ...syncMetadata,
  },
];

const categories: Category[] = [
  {
    id: 'category-food',
    householdId: 'household-1',
    name: 'Food',
    icon: 'utensils',
    color: '#16A34A',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
  },
  {
    id: 'category-income',
    householdId: 'household-1',
    name: 'Income',
    icon: 'wallet',
    color: '#059669',
    parentId: null,
    isIncome: true,
    isSystem: true,
    sortOrder: 2,
    ...syncMetadata,
  },
];

function makeEditTransaction(): Transaction {
  return {
    id: 'txn-edit-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -1234 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Coffee Shop',
    note: null,
    date: '2025-06-10',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    createdAt: '2025-06-10T00:00:00.000Z',
    updatedAt: '2025-06-10T00:00:00.000Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  } as Transaction;
}

function renderTransactionForm(overrides: Partial<TransactionFormProps> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = overrides.onCancel ?? vi.fn();

  render(
    <TransactionForm
      isOpen={true}
      onSubmit={onSubmit}
      onCancel={onCancel}
      accounts={accounts}
      categories={categories}
      {...overrides}
    />,
  );

  return { onSubmit, onCancel };
}

describe('validateTransactionSplits', () => {
  it('reports a zero remainder when split lines match the transaction total', () => {
    expect(
      validateTransactionSplits(1234, [
        { categoryId: 'category-food', amount: { amount: 734 }, note: 'Dinner' },
        { categoryId: 'category-income', amount: { amount: 500 }, note: null },
      ]),
    ).toMatchObject({ isBalanced: true, remainingCents: 0, splitTotalCents: 1234 });
  });

  it('reports the unassigned remainder when split lines do not balance', () => {
    expect(validateTransactionSplits(1234, [{ amount: { amount: 1000 } }])).toMatchObject({
      isBalanced: false,
      remainingCents: 234,
      error: 'Split amounts must equal the transaction total.',
    });
  });
});

describe('TransactionForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders form fields when open', () => {
    renderTransactionForm();

    expect(screen.getByRole('dialog', { name: 'New Transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveAttribute('data-dictation-label', 'Amount');
    expect(screen.getByLabelText('Amount')).toHaveAttribute('name', 'txn-amount');
    expect(screen.getByLabelText('Payee')).toHaveAttribute('data-dictation-label', 'Payee');
    expect(screen.getByLabelText('Payee')).toHaveAttribute('name', 'txn-description');
    expect(screen.getByText(/What appears on your statement/i)).toBeInTheDocument();
    expect(screen.getByText(/The actual merchant or person/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2025-06-15');
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add Transaction' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderTransactionForm({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows validation errors for empty required fields on submit', () => {
    const { onSubmit } = renderTransactionForm();

    fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));

    expect(screen.getByText('Amount must be greater than zero.')).toBeInTheDocument();
    expect(screen.getByText('Please select an account.')).toBeInTheDocument();
    const summary = screen.getByText('Some fields need attention').closest('.form-error-summary');
    expect(summary).toHaveAttribute('tabindex', '-1');
    expect(summary).toHaveAttribute('aria-live', 'assertive');
    expect(
      screen.getByRole('link', { name: /Amount: Amount must be greater than zero/i }),
    ).toHaveAttribute('href', '#txn-amount');
    expect(
      screen.getByRole('link', { name: /Account: Please select an account/i }),
    ).toHaveAttribute('href', '#txn-account');
    expect(screen.getByRole('status')).toHaveTextContent(/Some fields need attention/);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with transformed transaction data on valid submission', async () => {
    const { onSubmit } = renderTransactionForm();

    // Amount: type digits via keydown to get $12.34 (1234 cents)
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '1' });
    fireEvent.keyDown(amountInput, { key: '2' });
    fireEvent.keyDown(amountInput, { key: '3' });
    fireEvent.keyDown(amountInput, { key: '4' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: ' Coffee Shop ' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-06-10' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: 'household-1',
        accountId: 'account-1',
        type: 'EXPENSE',
        status: 'PENDING',
        amount: { amount: -1234 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: 'Coffee Shop',
        date: '2025-06-10',
        categoryId: null,
        note: null,
        tags: [],
        retirementContributionYear: null,
        retirementContributionDesignation: null,
        merchantCity: null,
        merchantState: null,
        merchantZip: null,
        merchantCountry: null,
        statementDescription: null,
        externalReferenceId: null,
        extraNotes: null,
        counterpartyName: null,
        // The local purchase time + zone is captured by default (issue #2206).
        // Values depend on the runner's zone, so assert shape rather than exact
        // offset to stay environment-portable.
        customFields: expect.objectContaining({
          occurredLocalTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
          occurredTimeZone: expect.any(String),
          occurredOffsetMinutes: expect.stringMatching(/^-?\d+$/),
        }),
      }),
    );
  });

  it('keeps the dialog open and preserves account context on "Save and add another" (#3650)', async () => {
    const { onSubmit, onCancel } = renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '1' });
    fireEvent.keyDown(amountInput, { key: '2' });
    fireEvent.keyDown(amountInput, { key: '3' });
    fireEvent.keyDown(amountInput, { key: '4' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Coffee Shop' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save and add another' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-1', payee: 'Coffee Shop' }),
      { addAnother: true },
    );
    // Dialog stays open (parent close callback not invoked) and the account is
    // preserved while amount/payee reset for the next entry.
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'New Transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Account')).toHaveValue('account-1');
    expect(screen.getByLabelText('Payee')).toHaveValue('');
    expect(screen.getByText(/ready to add another/i)).toBeInTheDocument();
  });

  it('does not render "Save and add another" in edit mode (#3650)', () => {
    renderTransactionForm({ initialData: makeEditTransaction() });
    expect(screen.queryByRole('button', { name: 'Save and add another' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Transaction' })).toBeInTheDocument();
  });

  it('submits retirement contribution tagging fields', async () => {
    const { onSubmit } = renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '7' });
    fireEvent.keyDown(amountInput, { key: '0' });
    fireEvent.keyDown(amountInput, { key: '0' });
    fireEvent.keyDown(amountInput, { key: '0' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'IRA contribution' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.click(
      screen.getByLabelText(
        'Count this transaction or transfer toward an annual contribution limit',
      ),
    );
    fireEvent.change(screen.getByLabelText('Contribution year'), { target: { value: '2025' } });
    fireEvent.change(screen.getByLabelText('Contribution designation'), {
      target: { value: 'EMPLOYEE' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        retirementContributionYear: 2025,
        retirementContributionDesignation: 'EMPLOYEE',
      }),
    );
  });

  it('persists tax-treatment custom fields when a business category is selected', async () => {
    const { onSubmit } = renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '9' });
    fireEvent.keyDown(amountInput, { key: '9' });
    fireEvent.keyDown(amountInput, { key: '0' });
    fireEvent.keyDown(amountInput, { key: '0' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Design software' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.change(screen.getByLabelText('Tax category'), {
      target: { value: 'SCHEDULE_C_EXPENSE' },
    });
    fireEvent.change(screen.getByLabelText('Business purpose (optional)'), {
      target: { value: 'Client logo design' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        customFields: expect.objectContaining({
          'tax.category': 'SCHEDULE_C_EXPENSE',
          'tax.deductibleStatus': 'DEDUCTIBLE',
          'tax.businessPurposeNote': 'Client logo design',
        }),
      }),
    );
  });

  it('submits balanced split lines with per-line categories and notes', async () => {
    const { onSubmit } = renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '1' });
    fireEvent.keyDown(amountInput, { key: '2' });
    fireEvent.keyDown(amountInput, { key: '3' });
    fireEvent.keyDown(amountInput, { key: '4' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Supermarket' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add split' }));
    expect(screen.getByText('Remaining: $0.00')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Split 1 category'), {
      target: { value: 'category-food' },
    });
    fireEvent.change(screen.getByLabelText('Split 1 amount'), { target: { value: '7.34' } });
    fireEvent.change(screen.getByLabelText('Split 1 note'), { target: { value: 'Groceries' } });
    expect(screen.getByText('Remaining: $5.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add split' }));
    fireEvent.change(screen.getByLabelText('Split 2 category'), {
      target: { value: 'category-income' },
    });
    fireEvent.change(screen.getByLabelText('Split 2 note'), { target: { value: 'Rebate' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 'category-food',
        splits: [
          {
            id: expect.any(String),
            categoryId: 'category-food',
            amount: { amount: 734 },
            note: 'Groceries',
            sharing: 'SHARED',
          },
          {
            id: expect.any(String),
            categoryId: 'category-income',
            amount: { amount: 500 },
            note: 'Rebate',
            sharing: 'SHARED',
          },
        ],
      }),
    );
  });

  it('blocks submission when split lines are not balanced', async () => {
    const { onSubmit } = renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '1' });
    fireEvent.keyDown(amountInput, { key: '2' });
    fireEvent.keyDown(amountInput, { key: '3' });
    fireEvent.keyDown(amountInput, { key: '4' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Supermarket' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add split' }));
    fireEvent.change(screen.getByLabelText('Split 1 amount'), { target: { value: '10.00' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(
      screen.getAllByText(/Split amounts must equal the transaction total/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Remaining: \$2\.34/i).length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const { onCancel } = renderTransactionForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks body scrolling while the modal is open and restores it on close', () => {
    document.body.style.overflow = 'auto';

    const { rerender } = render(
      <TransactionForm
        isOpen={true}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <TransactionForm
        isOpen={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  // ---------------------------------------------------------------------------
  // Additional details
  // ---------------------------------------------------------------------------

  it('shows additional details section when expanded', () => {
    renderTransactionForm();

    // Additional details section is collapsed by default
    expect(screen.queryByLabelText('Merchant City')).not.toBeInTheDocument();

    // Expand it
    fireEvent.click(screen.getByRole('button', { name: /additional details/i }));

    expect(screen.getByLabelText('Merchant City')).toHaveAttribute('placeholder', 'Seattle');
    expect(screen.getByLabelText('Merchant State')).toHaveAttribute('placeholder', 'WA');
    expect(screen.getByLabelText('Merchant ZIP')).toBeInTheDocument();
    expect(screen.getByLabelText('Merchant Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Statement Description')).toBeInTheDocument();
    expect(screen.getByLabelText('External Reference ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Extra Notes')).not.toHaveAttribute('placeholder');
    expect(screen.getByText('+ Add Field')).toBeInTheDocument();
  });

  it('can add and remove custom field entries', () => {
    renderTransactionForm();

    fireEvent.click(screen.getByRole('button', { name: /additional details/i }));
    fireEvent.click(screen.getByText('+ Add Field'));

    expect(screen.getByLabelText('Custom field 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom field 1 value')).toBeInTheDocument();

    // Remove it
    fireEvent.click(screen.getByRole('button', { name: /remove custom field 1/i }));
    expect(screen.queryByLabelText('Custom field 1 name')).not.toBeInTheDocument();
  });

  it('includes additional fields in submission data', async () => {
    const { onSubmit } = renderTransactionForm();

    // Fill required fields - amount uses keyDown events with useAmountInput
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '5' });
    fireEvent.keyDown(amountInput, { key: '0' });
    fireEvent.keyDown(amountInput, { key: '0' });
    fireEvent.keyDown(amountInput, { key: '0' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Test Merchant' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });

    // Expand and fill additional fields
    fireEvent.click(screen.getByRole('button', { name: /additional details/i }));
    fireEvent.change(screen.getByLabelText('Merchant City'), { target: { value: 'Denver' } });
    fireEvent.change(screen.getByLabelText('Merchant State'), { target: { value: 'CO' } });
    fireEvent.change(screen.getByLabelText('Statement Description'), {
      target: { value: 'TEST MERCHANT #1' },
    });
    fireEvent.change(screen.getByLabelText('Extra Notes'), {
      target: { value: 'Imported transaction' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantCity: 'Denver',
        merchantState: 'CO',
        statementDescription: 'TEST MERCHANT #1',
        extraNotes: 'Imported transaction',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Foreign-currency entry (issue #2202)
// ---------------------------------------------------------------------------

describe('TransactionForm — foreign-currency entry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function typeAmount(digits: string) {
    const amountInput = screen.getByLabelText('Amount');
    for (const digit of digits) {
      fireEvent.keyDown(amountInput, { key: digit });
    }
  }

  it('defaults the currency picker from the selected account and follows account changes', async () => {
    renderTransactionForm();

    // The currency picker + FX fields load lazily once the form opens.
    const currencyPicker = (await screen.findByLabelText('Currency')) as HTMLSelectElement;
    // No account selected yet: defaults to the USD base.
    expect(currencyPicker.value).toBe('USD');

    // Selecting the EUR account moves the (untouched) currency to EUR.
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-2' } });
    expect(currencyPicker.value).toBe('EUR');
    // Same currency as the account => no exchange-rate field (no extra friction).
    expect(screen.queryByLabelText('Exchange rate')).not.toBeInTheDocument();

    // Selecting the USD account moves it back to USD.
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    expect(currencyPicker.value).toBe('USD');
  });

  it('reveals the exchange-rate field and announces the base equivalent for foreign spend', async () => {
    renderTransactionForm();

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    typeAmount('100000'); // ฿1,000.00 (THB has 2 decimals)

    // Override the currency to THB (picker loads lazily).
    fireEvent.change(await screen.findByLabelText('Currency'), { target: { value: 'THB' } });

    const rateField = await screen.findByLabelText('Exchange rate');
    expect(rateField).toBeInTheDocument();
    expect(rateField).toHaveAttribute('aria-required', 'true');

    // Before a rate is entered, the live region prompts for one.
    const equivalent = document.getElementById('txn-fx-equivalent');
    expect(equivalent).toHaveAttribute('aria-live', 'polite');
    expect(equivalent).toHaveTextContent(/Enter a rate to see the USD equivalent/i);

    // 1 THB = 0.029 USD -> 1000.00 THB = $29.00 USD.
    fireEvent.change(rateField, { target: { value: '0.029' } });
    expect(equivalent).toHaveTextContent(/Base-currency equivalent/i);
    expect(equivalent).toHaveTextContent(/29\.00/);
    // The rate field is programmatically associated with the live equivalent.
    expect(rateField.getAttribute('aria-describedby')).toContain('txn-fx-equivalent');
  });

  it('blocks submission with an associated error when the foreign rate is missing', async () => {
    const { onSubmit } = renderTransactionForm();

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    typeAmount('100000');
    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Street food' } });
    fireEvent.change(await screen.findByLabelText('Currency'), { target: { value: 'THB' } });
    await screen.findByLabelText('Exchange rate');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    const rateField = screen.getByLabelText('Exchange rate');
    expect(rateField).toHaveAttribute('aria-invalid', 'true');
    expect(rateField.getAttribute('aria-describedby')).toContain('txn-exchange-rate-error');
    expect(screen.getByText('Enter the exchange rate used.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('stores the converted base amount and captures original amount, rate, and timestamp', async () => {
    const { onSubmit } = renderTransactionForm();

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    typeAmount('100000'); // ฿1,000.00
    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Night market' } });
    fireEvent.change(await screen.findByLabelText('Currency'), { target: { value: 'THB' } });
    const rateField = await screen.findByLabelText('Exchange rate');
    fireEvent.change(rateField, { target: { value: '0.029' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        // Expense of 1000.00 THB at 0.029 -> -$29.00 stored in the USD account.
        amount: { amount: -2900 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: 'Night market',
        customFields: expect.objectContaining({
          fxAmtMinor: '-100000',
          fxCcy: 'THB',
          fxRate: '0.029',
          fxBaseCcy: 'USD',
          fxRateTs: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      }),
    );
  });

  it('correctly converts a zero-decimal currency (JPY) into base cents', async () => {
    const { onSubmit } = renderTransactionForm();

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.change(await screen.findByLabelText('Currency'), { target: { value: 'JPY' } });
    // JPY has 0 decimals: typing "10000" means ¥10,000 (not ¥100.00).
    typeAmount('10000');
    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Ramen' } });
    // 1 JPY = 0.0067 USD -> 10000 JPY = $67.00.
    const rateField = await screen.findByLabelText('Exchange rate');
    fireEvent.change(rateField, { target: { value: '0.0067' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: { amount: -6700 },
        currency: { code: 'USD', decimalPlaces: 2 },
        customFields: expect.objectContaining({
          fxAmtMinor: '-10000',
          fxCcy: 'JPY',
        }),
      }),
    );
  });
});
