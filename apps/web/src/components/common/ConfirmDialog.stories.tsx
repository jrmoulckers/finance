// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { ConfirmDialog } from './ConfirmDialog';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Common/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onConfirm: fn(),
    onCancel: fn(),
  },
  argTypes: {
    variant: { control: 'select', options: ['danger', 'warning', 'info'] },
    isLoading: { control: 'boolean' },
    isOpen: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const DangerDefault: Story = {
  args: {
    isOpen: true,
    title: 'Delete transaction',
    message: 'Are you sure you want to delete this transaction? This action cannot be undone.',
    variant: 'danger',
  },
};

export const WarningVariant: Story = {
  args: {
    isOpen: true,
    title: 'Archive account',
    message:
      'Archiving this account will hide it from your dashboard. You can restore it later from settings.',
    variant: 'warning',
    confirmLabel: 'Archive',
  },
};

export const InfoVariant: Story = {
  args: {
    isOpen: true,
    title: 'Export data',
    message: 'This will export all your financial data as a JSON file.',
    variant: 'info',
    confirmLabel: 'Export',
  },
};

export const Loading: Story = {
  args: {
    isOpen: true,
    title: 'Delete account',
    message: 'Are you sure you want to permanently delete this account and all its transactions?',
    variant: 'danger',
    isLoading: true,
  },
};

export const CustomLabels: Story = {
  args: {
    isOpen: true,
    title: 'Confirm transfer',
    message: 'Transfer $500 from Checking to Savings?',
    variant: 'info',
    confirmLabel: 'Transfer now',
    cancelLabel: 'Go back',
  },
};
