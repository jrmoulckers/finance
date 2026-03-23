// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { CategoryPieChart } from '../charts/CategoryPieChart';
import type { CategorySlice } from '../charts/CategoryPieChart';

const meta: Meta<typeof CategoryPieChart> = {
  title: 'Charts/CategoryPieChart',
  component: CategoryPieChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    currency: { control: 'text' },
    width: { control: 'number' },
    height: { control: 'number' },
    title: { control: 'text' },
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
type Story = StoryObj<typeof CategoryPieChart>;

const fiveCategories: CategorySlice[] = [
  { name: 'Housing', value: 1800 },
  { name: 'Groceries', value: 620 },
  { name: 'Transport', value: 340 },
  { name: 'Entertainment', value: 210 },
  { name: 'Utilities', value: 280 },
];

export const Default: Story = {
  args: {
    data: fiveCategories,
    title: 'Spending by category',
  },
};

export const FewCategories: Story = {
  args: {
    data: [
      { name: 'Rent', value: 1500 },
      { name: 'Everything Else', value: 850 },
    ],
    title: 'Simplified breakdown',
  },
};

export const ManyCategories: Story = {
  args: {
    data: [
      { name: 'Housing', value: 1800 },
      { name: 'Groceries', value: 620 },
      { name: 'Transport', value: 340 },
      { name: 'Dining Out', value: 290 },
      { name: 'Utilities', value: 280 },
      { name: 'Insurance', value: 250 },
      { name: 'Healthcare', value: 180 },
      { name: 'Entertainment', value: 160 },
      { name: 'Clothing', value: 120 },
      { name: 'Personal Care', value: 85 },
    ],
    title: 'Detailed spending (10 categories)',
  },
};

export const Empty: Story = {
  args: {
    data: [],
    title: 'No spending data',
  },
};
