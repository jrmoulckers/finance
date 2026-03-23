// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';

const meta: Meta<typeof KeyboardShortcutsModal> = {
  title: 'Common/KeyboardShortcutsModal',
  component: KeyboardShortcutsModal,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onClose: fn(),
  },
  argTypes: {
    isOpen: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof KeyboardShortcutsModal>;

export const Open: Story = {
  args: {
    isOpen: true,
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};
