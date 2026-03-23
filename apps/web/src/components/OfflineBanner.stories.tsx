// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';

import { OfflineBanner } from './OfflineBanner';

const meta: Meta<typeof OfflineBanner> = {
  title: 'Components/OfflineBanner',
  component: OfflineBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '**OfflineBanner** uses the `useOfflineStatus()` hook internally to detect the ' +
          'browser\'s network state. It renders a non-intrusive banner with `role="status"` ' +
          'and `aria-live="polite"` when the user goes offline.\n\n' +
          '### How it works\n' +
          '- Subscribes to `window` `online`/`offline` events via `useOfflineStatus()`.\n' +
          '- When offline, the banner is visible; when online, it is hidden via a CSS modifier class.\n' +
          '- No props are accepted — behavior is entirely driven by browser connectivity state.\n\n' +
          '### Testing in Storybook\n' +
          "To see the offline state, use your browser's DevTools → Network → toggle **Offline** mode. " +
          'The banner will appear automatically.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof OfflineBanner>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Renders the OfflineBanner in its current connectivity state. ' +
          "Toggle your browser's network status in DevTools to see the banner appear/disappear.",
      },
    },
  },
};
