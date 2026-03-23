// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';

import { LoadingSpinner } from './LoadingSpinner';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'Common/LoadingSpinner',
  component: LoadingSpinner,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    size: { control: { type: 'number', min: 10, max: 120, step: 5 } },
    label: { control: 'text' },
  },
};
export default meta;
type Story = StoryObj<typeof LoadingSpinner>;

export const Default: Story = {
  args: {},
};

export const Small: Story = {
  args: {
    size: 20,
    label: 'Loading',
  },
};

export const Large: Story = {
  args: {
    size: 80,
    label: 'Loading',
  },
};

export const CustomLabel: Story = {
  args: {
    size: 40,
    label: 'Fetching transactions…',
  },
};
