// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { Budget, Category } from '../../kmp/bridge';
import { BudgetForm } from './BudgetForm';

import './forms.css';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

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
    name: 'Healthcare',
    icon: '🏥',
    color: '#E91E63',
    parentId: null,
    isIncome: false,
    isSystem: true,
    sortOrder: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'cat-6',
    householdId: 'hh-1',
    name: 'Salary',
    icon: '💰',
    color: '#00BCD4',
    parentId: null,
    isIncome: true,
    isSystem: true,
    sortOrder: 6,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
];

const mockBudget: Budget = {
  id: 'budget-1',
  householdId: 'hh-1',
  categoryId: 'cat-1',
  name: 'Food & Dining',
  amount: { amount: 50000 },
  currency: { code: 'USD', decimalPlaces: 2 },
  period: 'MONTHLY',
  startDate: '2026-01-01',
  endDate: null,
  isRollover: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof BudgetForm> = {
  title: 'Forms/BudgetForm',
  component: BudgetForm,
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
type Story = StoryObj<typeof BudgetForm>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Empty form with no categories provided. */
export const Default: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    categories: [],
  },
};

/** Form populated with six realistic categories. */
export const WithCategories: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    categories: mockCategories,
  },
};

/** Pre-filled form for editing an existing budget. */
export const EditMode: Story = {
  args: {
    isOpen: true,
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    categories: mockCategories,
    initialData: mockBudget,
  },
};
