// SPDX-License-Identifier: BUSL-1.1

import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'image-alt', enabled: true },
          { id: 'label', enabled: true },
        ],
      },
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: 'centered',
  },
  decorators: [
    (Story, context) => {
      const scheme = context.globals?.colorScheme ?? 'light';
      document.documentElement.setAttribute('data-theme', scheme);
      return Story();
    },
  ],
  globalTypes: {
    colorScheme: {
      description: 'Color scheme for components',
      toolbar: {
        title: 'Color Scheme', icon: 'mirror',
        items: [{ value: 'light', title: 'Light' }, { value: 'dark', title: 'Dark' }],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { colorScheme: 'light' },
};

export default preview;