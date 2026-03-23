// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { Account, Category, Transaction } from '../../kmp/bridge';
import { TransactionForm } from './TransactionForm';

import './forms.css';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    householdId: 'hh-1',
    name: 'Checking Account',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 250000 },
    isArchived: false,
    sortOrder: 1,
    icon: null,
    color: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'acc-2',
    householdId: 'hh-1',
    name: 'Savings Account',
    type: 'SAVINGS',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 1500000 },
    isArchived: false,
    sortOrder: 2,
    icon: null,
    color: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'acc-3',
    householdId: 'hh-1',
    name: 'Credit Card',
    type: 'CREDIT_CARD',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: -45000 },
    isArchived: false,
    sortOrder: 3,
    icon: null,
    color: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
];

const mockCategories: Category[] = [
  {
    id: 'cat-1',
    householdId: 'hh-1',
    name: 'Food & Dining',
    icon: '🍔',
    color: '#4CAF50',
    parentId: null,
    isIncome: false,
    isSystem: true,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'cat-2',
    householdId: 'hh-1',
    name: 'Transportation',
    icon: '🚗',
    color: '#2196F3',
    parentId: null,
    isIncome: false,
    isSystem: true,
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'cat-3',
    householdId: 'hh-1',
    name: 'Entertainment',
    icon: '🎬',
    color: '#FF9800',
    parentId: null,
    isIncome: false,
    isSystem: true,
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'cat-4',
    householdId: 'hh-1',
    name: 'Utilities',
    icon: '💡',
    color: '#9C27B0',
    parentId: null,
    isIncome: false,
    isSystem: true,
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'cat-5',
    householdId: 'hh-1',
    name: 'Salary',
    icon: '💰',
    color: '#00BCD4',
    parentId: null,
    isIncome: true,
    isSystem: true,
    sortOrder: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
];

const mockTransaction: Transaction = {
  id: 'txn-1',
  householdId: 'hh-1',
  accountId: 'acc-1',
  categoryId: 'cat-1',
  type: 'EXPENSE',
  status: 'CLEARED',
  amount: { amount: -4525 },
  currency: { code: 'USD', decimalPlaces: 2 },
  payee: 'Corner Grocery Store',
  note: 'Weekly groceries',
  date: '2026-04-10',
  transferAccountId: null,
  transferTransactionId: null,
  isRecurring: false,
  recurringRuleId: null,
  tags: ['groceries'],
  createdAt: '2026-04-10T14:30:00Z',
  updatedAt: '2026-04-10T14:30:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof TransactionForm> = {
  title: 'Forms/TransactionForm',
  component: TransactionForm,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    isOpen: { control: 'boolean' },
    onSubmit: { action: 'onSubmit' },
    onCancel: { action: 'onCancel' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', minWidth: 360, maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof TransactionForm>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Empty form with no accounts or categories. */
export const Default: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    accounts: [],
    categories: [],
  },
};

/** Form populated with accounts and categories ready for data entry. */
export const WithData: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    accounts: mockAccounts,
    categories: mockCategories,
  },
};

/** Pre-filled form for editing an existing grocery transaction. */
export const EditMode: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    accounts: mockAccounts,
    categories: mockCategories,
    initialData: mockTransaction,
  },
};
