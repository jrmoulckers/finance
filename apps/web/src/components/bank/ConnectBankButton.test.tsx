// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for {@link ConnectBankButton} (#3846).
 *
 * The button orchestrates the whole "connect a bank" handshake, pulling the
 * aggregator layer + Plaid Link loader in via dynamic `import()`. Those modules
 * are mocked here so the test asserts the orchestration (create → open →
 * complete → refresh) without a real backend or Plaid CDN.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../test-utils/axe';

const mocks = vi.hoisted(() => ({
  getPrimaryHouseholdId: vi.fn(),
  ensureAggregatorProvidersRegistered: vi.fn(),
  createConnection: vi.fn(),
  completeConnection: vi.fn(),
  openPlaidLink: vi.fn(),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => ({ __fakeDb: true }),
}));

vi.mock('../../db/repositories/household', () => ({
  getPrimaryHouseholdId: mocks.getPrimaryHouseholdId,
}));

vi.mock('../../lib/banking/connection-manager', () => ({
  ConnectionManager: class {
    createConnection = mocks.createConnection;
    completeConnection = mocks.completeConnection;
  },
}));

vi.mock('../../lib/banking/provider-registry', () => ({
  defaultRegistry: { __registry: true },
}));

vi.mock('../../lib/banking/register-aggregator-providers', () => ({
  ensureAggregatorProvidersRegistered: mocks.ensureAggregatorProvidersRegistered,
}));

vi.mock('../../lib/banking/plaid-link', () => ({
  openPlaidLink: mocks.openPlaidLink,
}));

import { ConnectBankButton } from './ConnectBankButton';

const PLAID_METADATA = {
  institution: { name: 'First Platypus Bank', institution_id: 'ins_109508' },
};

describe('ConnectBankButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPrimaryHouseholdId.mockResolvedValue('hh-1');
    mocks.ensureAggregatorProvidersRegistered.mockResolvedValue(undefined);
    mocks.createConnection.mockResolvedValue({ sessionId: 'link-token-1' });
    mocks.completeConnection.mockResolvedValue({ id: 'conn-1' });
    mocks.openPlaidLink.mockResolvedValue({ open: vi.fn(), exit: vi.fn(), destroy: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a "Connect a bank" button with no axe violations', async () => {
    const { container } = render(<ConnectBankButton />);

    expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.getPrimaryHouseholdId).toHaveBeenCalled());
    await expectNoAxeViolations(container);
  });

  it('runs the full create → open → complete → refresh handshake', async () => {
    // Plaid Link "succeeds": invoke the onSuccess callback the component passes.
    mocks.openPlaidLink.mockImplementation(
      async (opts: {
        token: string;
        onSuccess: (publicToken: string, metadata: typeof PLAID_METADATA) => void;
      }) => {
        opts.onSuccess('public-token-xyz', PLAID_METADATA);
        return { open: vi.fn(), exit: vi.fn(), destroy: vi.fn() };
      },
    );

    const onConnected = vi.fn();
    render(<ConnectBankButton onConnected={onConnected} />);
    await waitFor(() => expect(mocks.getPrimaryHouseholdId).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));

    await waitFor(() => expect(mocks.completeConnection).toHaveBeenCalled());

    expect(mocks.ensureAggregatorProvidersRegistered).toHaveBeenCalledTimes(1);
    expect(mocks.createConnection).toHaveBeenCalledWith('plaid', {
      metadata: { household_id: 'hh-1' },
    });
    expect(mocks.openPlaidLink).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'link-token-1' }),
    );
    expect(mocks.completeConnection).toHaveBeenCalledWith('plaid', 'link-token-1', {
      public_token: 'public-token-xyz',
      institutionId: 'ins_109508',
      institutionName: 'First Platypus Bank',
      household_id: 'hh-1',
    });
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
  });

  it('shows an error and does not start linking when there is no household', async () => {
    mocks.getPrimaryHouseholdId.mockResolvedValue(null);

    render(<ConnectBankButton />);
    await waitFor(() => expect(mocks.getPrimaryHouseholdId).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/create a household/i);
    expect(mocks.ensureAggregatorProvidersRegistered).not.toHaveBeenCalled();
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it('surfaces the Plaid display message when the user exits with an error', async () => {
    mocks.openPlaidLink.mockImplementation(
      async (opts: { onExit?: (error: { display_message: string } | null) => void }) => {
        opts.onExit?.({ display_message: 'The bank declined the connection.' });
        return { open: vi.fn(), exit: vi.fn(), destroy: vi.fn() };
      },
    );

    render(<ConnectBankButton />);
    await waitFor(() => expect(mocks.getPrimaryHouseholdId).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The bank declined the connection.');
    expect(mocks.completeConnection).not.toHaveBeenCalled();
  });
});
