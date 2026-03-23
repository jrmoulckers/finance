// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { BudgetDonutChart } from '../charts/BudgetDonutChart';
import type { BudgetSlice } from '../charts/BudgetDonutChart';

const meta: Meta<typeof BudgetDonutChart> = {
  title: 'Charts/BudgetDonutChart',
  component: BudgetDonutChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    currency: { control: 'text' },
    height: { control: 'number' },
    title: { control: 'text' },
    centerLabel: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof BudgetDonutChart>;

const defaultBudget: BudgetSlice[] = [
  { name: 'Housing', value: 1800 },
  { name: 'Food & Dining', value: 750 },
  { name: 'Transport', value: 350 },
  { name: 'Savings', value: 600 },
];

export const Default: Story = {
  args: {
    data: defaultBudget,
    title: 'Monthly budget allocation',
  },
};

export const UnderBudget: Story = {
  args: {
    data: [
      { name: 'Groceries', value: 320 },
      { name: 'Dining Out', value: 85 },
      { name: 'Transport', value: 140 },
      { name: 'Entertainment', value: 45 },
    ],
    title: 'Under budget — great month!',
  },
};

export const OverBudget: Story = {
  args: {
    data: [
      { name: 'Housing', value: 2100 },
      { name: 'Food & Dining', value: 980 },
      { name: 'Transport', value: 520 },
      { name: 'Healthcare', value: 450 },
    ],
    title: 'Over budget — needs attention',
  },
};

export const Empty: Story = {
  args: {
    data: [],
    title: 'No budget data',
  },
};

export const WithCenterLabel: Story = {
  args: {
    data: defaultBudget,
    title: 'Budget with custom label',
    centerLabel: '72% used',
  },
};
