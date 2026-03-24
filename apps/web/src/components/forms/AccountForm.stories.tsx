// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { Account } from '../../kmp/bridge';
import { DatabaseContext } from '../../db/DatabaseProvider';
import type { SqliteDb } from '../../db/sqlite-wasm';
import { AccountForm } from './AccountForm';

import './forms.css';

// ---------------------------------------------------------------------------
// Mock database — AccountForm calls useDatabase() to resolve householdId
// ---------------------------------------------------------------------------

const mockDb: SqliteDb = {
  exec: fn(),
  selectAll: fn().mockReturnValue([]),
  selectOne: fn().mockReturnValue({ id: 'hh-1' }),
  close: fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockAccount: Account = {
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
};

const mockSavingsAccount: Account = {
  id: 'acc-2',
  householdId: 'hh-1',
  name: 'High-Yield Savings',
  type: 'SAVINGS',
  currency: { code: 'USD', decimalPlaces: 2 },
  currentBalance: { amount: 1500000 },
  isArchived: false,
  sortOrder: 2,
  icon: null,
  color: null,
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-03-10T00:00:00Z',
  deletedAt: null,
  syncVersion: 3,
  isSynced: true,
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof AccountForm> = {
  title: 'Forms/AccountForm',
  component: AccountForm,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    isOpen: { control: 'boolean' },
    onSubmit: { action: 'onSubmit' },
    onCancel: { action: 'onCancel' },
  },
  decorators: [
    (Story) => (
      <DatabaseContext.Provider value={mockDb}>
        <div style={{ width: '100%', minWidth: 360, maxWidth: 480 }}>
          <Story />
        </div>
      </DatabaseContext.Provider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AccountForm>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Empty form for creating a new account. */
export const Default: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
  },
};

/** Pre-filled form for editing an existing account. */
export const EditMode: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    initialData: mockAccount,
  },
};

/** Edit a savings account with a larger balance. */
export const EditSavings: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    initialData: mockSavingsAccount,
  },
};

/** Simulates a slow submit to show the loading/submitting state. */
export const Submitting: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 60_000)),
    ),
    onCancel: fn(),
  },
};
