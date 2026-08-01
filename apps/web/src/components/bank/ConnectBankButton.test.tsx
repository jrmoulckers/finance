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
  readHouseholdValue: vi.fn(),
  ensureSyncedHouseholdMembership: vi.fn(),
  ensureDefaultHousehold: vi.fn(),
  ensureAggregatorProvidersRegistered: vi.fn(),
  createConnection: vi.fn(),
  completeConnection: vi.fn(),
  openPlaidLink: vi.fn(),
  authUser: null as { id: string; name?: string; email?: string } | null,
}));

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({ user: mocks.authUser }),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => ({ __fakeDb: true }),
}));

vi.mock('../../db/repositories/household', () => ({
  ensureSyncedHouseholdMembership: mocks.ensureSyncedHouseholdMembership,
  ensureDefaultHousehold: mocks.ensureDefaultHousehold,
}));

vi.mock('../../db/repositories/householdData', () => ({
  HOUSEHOLD_SINGLETON_KEY: 'finance-household',
  readHouseholdValue: mocks.readHouseholdValue,
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
    mocks.authUser = null;
    mocks.readHouseholdValue.mockResolvedValue({ id: 'hh-1' });
    mocks.ensureSyncedHouseholdMembership.mockResolvedValue(undefined);
    mocks.ensureDefaultHousehold.mockResolvedValue('hh-new');
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
    await waitFor(() => expect(mocks.readHouseholdValue).toHaveBeenCalled());
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
    await waitFor(() => expect(mocks.readHouseholdValue).toHaveBeenCalled());

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

  it('backfills the synced household membership for a signed-in owner', async () => {
    mocks.authUser = { id: 'user-1' };
    mocks.readHouseholdValue.mockResolvedValue({ id: 'hh-1', name: 'Test Household' });

    render(<ConnectBankButton />);

    await waitFor(() =>
      expect(mocks.ensureSyncedHouseholdMembership).toHaveBeenCalledWith(
        { __fakeDb: true },
        { householdId: 'hh-1', name: 'Test Household', userId: 'user-1' },
      ),
    );
    // An existing household is left untouched — no default is provisioned.
    expect(mocks.ensureDefaultHousehold).not.toHaveBeenCalled();
  });

  it('auto-provisions a default household on mount for a signed-in user with none', async () => {
    mocks.authUser = { id: 'user-1', name: 'Alex Rivera', email: 'alex@example.com' };
    mocks.readHouseholdValue.mockResolvedValue(null);

    render(<ConnectBankButton />);

    await waitFor(() =>
      expect(mocks.ensureDefaultHousehold).toHaveBeenCalledWith(
        { __fakeDb: true },
        { id: 'user-1', name: 'Alex Rivera', email: 'alex@example.com' },
      ),
    );
    // Provisioning owns the synced backfill; the mount effect must not also call
    // it directly for a household that did not exist yet.
    expect(mocks.ensureSyncedHouseholdMembership).not.toHaveBeenCalled();
  });

  it('connects using the auto-provisioned household without showing the wall', async () => {
    mocks.authUser = { id: 'user-1' };
    mocks.readHouseholdValue.mockResolvedValue(null);
    mocks.ensureDefaultHousehold.mockResolvedValue('hh-fresh');
    mocks.openPlaidLink.mockImplementation(
      async (opts: {
        token: string;
        onSuccess: (publicToken: string, metadata: typeof PLAID_METADATA) => void;
      }) => {
        opts.onSuccess('public-token-xyz', PLAID_METADATA);
        return { open: vi.fn(), exit: vi.fn(), destroy: vi.fn() };
      },
    );

    render(<ConnectBankButton />);
    await waitFor(() => expect(mocks.ensureDefaultHousehold).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));

    await waitFor(() =>
      expect(mocks.createConnection).toHaveBeenCalledWith('plaid', {
        metadata: { household_id: 'hh-fresh' },
      }),
    );
    expect(mocks.completeConnection).toHaveBeenCalledWith(
      'plaid',
      'link-token-1',
      expect.objectContaining({ household_id: 'hh-fresh' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not backfill membership when no user is signed in', async () => {
    render(<ConnectBankButton />);
    await waitFor(() => expect(mocks.readHouseholdValue).toHaveBeenCalled());

    expect(mocks.ensureSyncedHouseholdMembership).not.toHaveBeenCalled();
    expect(mocks.ensureDefaultHousehold).not.toHaveBeenCalled();
  });

  it('shows an error and does not start linking when there is no household and no user', async () => {
    mocks.readHouseholdValue.mockResolvedValue(null);

    render(<ConnectBankButton />);
    await waitFor(() => expect(mocks.readHouseholdValue).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/create a household/i);
    expect(mocks.ensureDefaultHousehold).not.toHaveBeenCalled();
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
    await waitFor(() => expect(mocks.readHouseholdValue).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Connect a bank' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The bank declined the connection.');
    expect(mocks.completeConnection).not.toHaveBeenCalled();
  });
});
