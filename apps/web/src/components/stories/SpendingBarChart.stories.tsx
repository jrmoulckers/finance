// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { SpendingBarChart } from '../charts/SpendingBarChart';

const meta: Meta<typeof SpendingBarChart> = {
  title: 'Charts/SpendingBarChart',
  component: SpendingBarChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    currency: { control: 'text' },
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
type Story = StoryObj<typeof SpendingBarChart>;

const sampleData = [
  { name: 'Groceries', amount: 450 },
  { name: 'Dining Out', amount: 280 },
  { name: 'Transport', amount: 120 },
  { name: 'Entertainment', amount: 95 },
  { name: 'Utilities', amount: 210 },
  { name: 'Healthcare', amount: 150 },
];

export const Default: Story = { args: { data: sampleData, title: 'Monthly spending by category' } };
export const FewCategories: Story = {
  args: {
    data: [
      { name: 'Rent', amount: 1500 },
      { name: 'Food', amount: 600 },
      { name: 'Transport', amount: 200 },
    ],
    title: 'Top 3 expenses',
  },
};
export const EuroCurrency: Story = {
  args: { data: sampleData, currency: 'EUR', title: 'Ausgaben nach Kategorie' },
};
export const TallChart: Story = {
  args: { data: sampleData, height: 480, title: 'Detailed spending view' },
};
export const SingleCategory: Story = {
  args: { data: [{ name: 'Groceries', amount: 450 }], title: 'Single category' },
};
export const EmptyData: Story = { args: { data: [], title: 'No spending data' } };
