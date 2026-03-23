// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ErrorBoundary } from './ErrorBoundary';

/**
 * Helper component that unconditionally throws during render.
 * Used to trigger the ErrorBoundary fallback UI in stories.
 */
const ThrowError: React.FC = () => {
  throw new Error('Test error: something went wrong in a child component');
};

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Common/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A class-based error boundary that catches rendering errors in its child tree and presents a recovery UI with "Try Again" and "Return to Dashboard" actions. ' +
          'In development mode, the caught error message is displayed for debugging.',
      },
    },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const WithError: Story = {
  args: {
    children: React.createElement(ThrowError),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the default error fallback UI rendered when a child component throws during render.',
      },
    },
  },
};

export const WithFallback: Story = {
  args: {
    children: React.createElement(ThrowError),
    fallback: React.createElement(
      'div',
      {
        style: {
          padding: 'var(--spacing-4, 1rem)',
          textAlign: 'center' as const,
          color: 'var(--semantic-status-negative, #dc2626)',
        },
      },
      React.createElement(
        'p',
        null,
        '⚠️ A custom fallback message provided via the fallback prop.',
      ),
      React.createElement('p', null, 'Contact support if this issue persists.'),
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the error boundary with a custom `fallback` prop, allowing consumers to provide their own error messaging.',
      },
    },
  },
};
