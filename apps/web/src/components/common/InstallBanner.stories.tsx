// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';

import { InstallBanner } from './InstallBanner';

const meta: Meta<typeof InstallBanner> = {
  title: 'Common/InstallBanner',
  component: InstallBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '**InstallBanner** prompts users to install the Finance PWA for quick access.\n\n' +
          '### Internal dependencies\n' +
          'This component uses the `useInstallPrompt()` hook which listens for the ' +
          "browser's `beforeinstallprompt` event. It exposes:\n" +
          '- `canInstall` — whether the install prompt is available\n' +
          '- `install()` — triggers the native install dialog\n' +
          '- `dismiss()` — hides the banner and persists the choice to `localStorage`\n\n' +
          '### Rendering behavior\n' +
          'The component renders **nothing** (`null`) when `canInstall` is `false`, which is ' +
          'the case in most Storybook environments since the `beforeinstallprompt` event is not fired.\n\n' +
          '### Testing the banner\n' +
          'To see the install banner in action:\n' +
          '1. Build and serve the app over HTTPS (or localhost)\n' +
          '2. Open in a Chromium-based browser\n' +
          '3. The banner appears when the browser determines the app is installable',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof InstallBanner>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Renders InstallBanner in its default state. In Storybook the banner is typically ' +
          'hidden because the `beforeinstallprompt` event is not available outside a PWA context.',
      },
    },
  },
};
