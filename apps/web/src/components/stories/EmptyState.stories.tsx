// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from '../common/EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Common/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: { title: { control: 'text' }, description: { control: 'text' } },
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: 'No transactions yet',
    description: 'Add your first transaction to start tracking your spending.',
  },
};
export const WithIcon: Story = {
  args: {
    title: 'No data available',
    description: 'Nothing to display for the selected date range.',
    icon: '\u{1F4CA}',
  },
};
export const MinimalTitle: Story = { args: { title: 'Nothing here' } };
