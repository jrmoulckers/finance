// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { TrendLineChart } from '../charts/TrendLineChart';
import type { TrendDataPoint, TrendSeries } from '../charts/TrendLineChart';

const meta: Meta<typeof TrendLineChart> = {
  title: 'Charts/TrendLineChart',
  component: TrendLineChart,
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
type Story = StoryObj<typeof TrendLineChart>;

const sixMonthData: TrendDataPoint[] = [
  { label: 'Jan', income: 5200, expenses: 3800 },
  { label: 'Feb', income: 5400, expenses: 4100 },
  { label: 'Mar', income: 5200, expenses: 3600 },
  { label: 'Apr', income: 5800, expenses: 4300 },
  { label: 'May', income: 5600, expenses: 3900 },
  { label: 'Jun', income: 6100, expenses: 4500 },
];

const incomeExpenseSeries: TrendSeries[] = [
  { dataKey: 'income', name: 'Income' },
  { dataKey: 'expenses', name: 'Expenses' },
];

export const Default: Story = {
  args: {
    data: sixMonthData,
    series: incomeExpenseSeries,
    title: 'Income vs Expenses (6 months)',
  },
};

export const SingleSeries: Story = {
  args: {
    data: sixMonthData,
    series: [{ dataKey: 'expenses', name: 'Expenses' }],
    title: 'Monthly expenses',
  },
};

export const Empty: Story = {
  args: {
    data: [],
    series: incomeExpenseSeries,
    title: 'No data available',
  },
};

export const CustomCurrency: Story = {
  args: {
    data: [
      { label: 'Jan', income: 4800, expenses: 3200 },
      { label: 'Feb', income: 4900, expenses: 3500 },
      { label: 'Mar', income: 5100, expenses: 3100 },
      { label: 'Apr', income: 5300, expenses: 3800 },
      { label: 'May', income: 5000, expenses: 3400 },
      { label: 'Jun', income: 5500, expenses: 3900 },
    ],
    series: incomeExpenseSeries,
    currency: 'EUR',
    title: 'Einnahmen vs Ausgaben',
  },
};
