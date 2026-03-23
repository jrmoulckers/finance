// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';

import { UpdateBanner } from './UpdateBanner';

const meta: Meta<typeof UpdateBanner> = {
  title: 'Common/UpdateBanner',
  component: UpdateBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '**UpdateBanner** notifies users when a new version of the app is available and ' +
          'offers an in-place update.\n\n' +
          '### Internal dependencies\n' +
          'This component uses the `useServiceWorkerUpdate()` hook which monitors the ' +
          'service worker lifecycle for waiting updates. It exposes:\n' +
          '- `updateAvailable` — `true` when a new service worker is waiting to activate\n' +
          '- `applyUpdate()` — sends `SKIP_WAITING` to the service worker and reloads the page\n\n' +
          '### Rendering behavior\n' +
          'The component renders **nothing** when `updateAvailable` is `false` or the user ' +
          'has dismissed the notification. In Storybook, no service worker is registered so ' +
          'the banner will not be visible.\n\n' +
          '### Testing the banner\n' +
          'To see the update banner:\n' +
          '1. Build and deploy the production app\n' +
          '2. Deploy a new version (so the service worker detects a change)\n' +
          '3. Revisit the app — the banner appears when the new worker enters the `waiting` state',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof UpdateBanner>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Renders UpdateBanner in its default state. In Storybook the banner is hidden ' +
          'because no service worker update is available outside a production PWA context.',
      },
    },
  },
};
