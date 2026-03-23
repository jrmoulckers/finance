// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { Goal } from '../../kmp/bridge';
import { DatabaseContext } from '../../db/DatabaseProvider';
import type { SqliteDb } from '../../db/sqlite-wasm';
import { GoalForm } from './GoalForm';

import './forms.css';

// ---------------------------------------------------------------------------
// Mock database — GoalForm calls useDatabase() to resolve householdId
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

const mockGoal: Goal = {
  id: 'goal-1',
  householdId: 'hh-1',
  name: 'Emergency Fund',
  targetAmount: { amount: 1000000 },
  currentAmount: { amount: 350000 },
  currency: { code: 'USD', decimalPlaces: 2 },
  targetDate: '2027-06-30',
  status: 'ACTIVE',
  icon: '🛡️',
  color: '#4CAF50',
  accountId: null,
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 4,
  isSynced: true,
};

const mockVacationGoal: Goal = {
  id: 'goal-2',
  householdId: 'hh-1',
  name: 'Summer Vacation',
  targetAmount: { amount: 300000 },
  currentAmount: { amount: 125000 },
  currency: { code: 'USD', decimalPlaces: 2 },
  targetDate: '2026-07-15',
  status: 'ACTIVE',
  icon: '✈️',
  color: '#2196F3',
  accountId: null,
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-03-20T00:00:00Z',
  deletedAt: null,
  syncVersion: 2,
  isSynced: true,
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof GoalForm> = {
  title: 'Forms/GoalForm',
  component: GoalForm,
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
type Story = StoryObj<typeof GoalForm>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Empty form for creating a new savings goal. */
export const Default: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
  },
};

/** Pre-filled form for editing an existing emergency fund goal. */
export const EditMode: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    initialData: mockGoal,
  },
};

/** Pre-filled form for editing a vacation savings goal. */
export const EditVacation: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    initialData: mockVacationGoal,
  },
};
