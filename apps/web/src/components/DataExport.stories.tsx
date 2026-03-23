// SPDX-License-Identifier: BUSL-1.1

import type { Meta, StoryObj } from '@storybook/react';

import { DataExport } from './DataExport';

const meta: Meta<typeof DataExport> = {
  title: 'Components/DataExport',
  component: DataExport,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '**DataExport** allows users to download their financial data as JSON or CSV.\n\n' +
          '### Internal dependencies\n' +
          'This component calls `useDatabase()` from `DatabaseProvider` to access the ' +
          'local SQLite-WASM database. When the database provider is not available, ' +
          'the component gracefully degrades — showing a "Database is not available" message ' +
          'and disabling the export buttons.\n\n' +
          '### What this story shows\n' +
          'Because Storybook renders outside the full app provider tree, the database is ' +
          'unavailable and the component displays its fallback/disabled state. This is useful ' +
          'for verifying the error-handling UX and the layout of the export controls.\n\n' +
          '### Testing the full flow\n' +
          'To test the complete export flow with a live database, run the full application ' +
          'and navigate to Settings → Data Export.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DataExport>;

export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          'Renders DataExport without a database provider. The component shows its ' +
          'unavailable state with disabled export buttons.',
      },
    },
  },
};
