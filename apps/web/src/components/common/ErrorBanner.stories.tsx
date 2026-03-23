// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { ErrorBanner } from './ErrorBanner';

const meta: Meta<typeof ErrorBanner> = {
  title: 'Common/ErrorBanner',
  component: ErrorBanner,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ErrorBanner>;

export const Default: Story = {
  args: {
    message: 'Failed to load transactions. Please check your connection.',
  },
};

export const WithRetry: Story = {
  args: {
    message: 'Unable to sync your data. Please try again.',
    onRetry: fn(),
  },
};

export const WithDismiss: Story = {
  args: {
    message: 'An unexpected error occurred.',
    onDismiss: fn(),
  },
};

export const WithBoth: Story = {
  args: {
    message: 'Failed to save budget changes.',
    onRetry: fn(),
    onDismiss: fn(),
  },
};

export const LongMessage: Story = {
  args: {
    message:
      'We encountered an unexpected error while processing your request. This may be due to a temporary service interruption or a network connectivity issue. Please verify your internet connection and try again. If the problem persists, contact support with error code FIN-ERR-5021.',
    onRetry: fn(),
    onDismiss: fn(),
  },
};
