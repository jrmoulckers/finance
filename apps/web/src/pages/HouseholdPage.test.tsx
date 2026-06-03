// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../auth/auth-context';
import { useToast } from '../components/common/Toast';
import { useHousehold } from '../hooks/useHousehold';
import type { UseHouseholdResult } from '../hooks/useHousehold';
import { HouseholdPage } from './HouseholdPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../hooks/useHousehold', () => ({
  useHousehold: vi.fn(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../components/common/Toast', () => ({
  useToast: vi.fn(),
}));

const mockedUseHousehold = vi.mocked(useHousehold);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseToast = vi.mocked(useToast);

function mockHouseholdResult(overrides: Partial<UseHouseholdResult> = {}): UseHouseholdResult {
  return {
    household: null,
    members: [],
    invitations: [],
    accountSharings: [],
    sharedBudgets: [],
    sharedGoals: [],
    loading: false,
    error: null,
    createHousehold: vi.fn(),
    inviteMember: vi.fn(),
    acceptInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    checkPermission: vi.fn().mockReturnValue(false),
    setAccountSharing: vi.fn(),
    isAccountVisible: vi.fn().mockReturnValue(false),
    setSharedBudget: vi.fn(),
    removeSharedBudget: vi.fn(),
    setSharedGoal: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper — creates a standard household for tests that need one
// ---------------------------------------------------------------------------

function makeHousehold(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hh-1',
    name: 'Smith Family',
    ownerId: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

function makeOwnerMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    householdId: 'hh-1',
    userId: 'user-1-abcdef',
    displayName: null,
    role: 'OWNER' as const,
    joinedAt: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HouseholdPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no signed-in user.  Tests that exercise the OAuth-fallback
    // path override this with a more specific value.
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      webAuthnSupported: false,
      isDemoMode: false,
      isOffline: false,
      showPasskeyPrompt: false,
      dismissPasskeyPrompt: vi.fn(),
      loginWithEmail: vi.fn(),
      loginWithPasskey: vi.fn(),
      loginWithOAuth: vi.fn(),
      registerNewPasskey: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      refresh: vi.fn(),
      signupWithEmail: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    mockedUseToast.mockReturnValue({
      showToast: vi.fn(),
      dismissToast: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockedUseHousehold.mockReturnValue(mockHouseholdResult({ loading: true }));

    render(<HouseholdPage />);

    expect(screen.getByText('Loading household data…')).toBeInTheDocument();
  });

  it('shows creation form when no household exists', () => {
    mockedUseHousehold.mockReturnValue(mockHouseholdResult());

    render(<HouseholdPage />);

    expect(screen.getByText('Create Your Household')).toBeInTheDocument();
    expect(screen.getByLabelText(/household name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create household/i })).toBeInTheDocument();
  });

  it('mentions privacy-by-default in creation form', () => {
    mockedUseHousehold.mockReturnValue(mockHouseholdResult());

    render(<HouseholdPage />);

    expect(screen.getByText(/privacy-by-default/i)).toBeInTheDocument();
  });

  it('renders household management when household exists', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember()],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Smith Family')).toBeInTheDocument();
    expect(screen.getByText('Family Plan')).toBeInTheDocument();
    expect(screen.getByText('Members & Roles')).toBeInTheDocument();
    expect(screen.getByText('Invite Member')).toBeInTheDocument();
    expect(screen.getByText('Account Sharing')).toBeInTheDocument();
    expect(screen.getByText('Shared Budgets')).toBeInTheDocument();
    expect(screen.getByText('Shared Goals')).toBeInTheDocument();
    expect(screen.getByText('Permission Reference')).toBeInTheDocument();
  });

  it('displays error banner when error exists', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        error: 'Something went wrong',
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('shows pending invitations section with invite code label and bare code value', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        invitations: [
          {
            id: 'inv-1',
            householdId: 'hh-1',
            invitedBy: 'user-1',
            email: 'partner@example.com',
            role: 'ADMIN',
            status: 'PENDING',
            inviteCode: 'abc12345',
            expiresAt: '2025-01-08T00:00:00Z',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Pending Invitations')).toBeInTheDocument();
    expect(screen.getByText('partner@example.com')).toBeInTheDocument();
    // #1932: explicit label is shown
    expect(screen.getByText('Invite code:')).toBeInTheDocument();
    // #1932: bare code is the visible text (no "Code: " prefix)
    expect(screen.getByText('abc12345')).toBeInTheDocument();
    // #1933: code is a button (focusable, click-to-copy)
    expect(
      screen.getByRole('button', { name: /copy invite link for partner@example\.com/i }),
    ).toBeInTheDocument();
  });

  it('copies the full invite URL to the clipboard and shows a toast when the code is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const showToast = vi.fn();
    mockedUseToast.mockReturnValue({
      showToast,
      dismissToast: vi.fn(),
    });

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        invitations: [
          {
            id: 'inv-1',
            householdId: 'hh-1',
            invitedBy: 'user-1',
            email: 'partner@example.com',
            role: 'ADMIN',
            status: 'PENDING',
            inviteCode: 'abc12345',
            expiresAt: '2025-01-08T00:00:00Z',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    const copyButton = screen.getByRole('button', {
      name: /copy invite link for partner@example\.com/i,
    });

    fireEvent.click(copyButton);

    // Wait a microtask for the awaited writeText to resolve.
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toMatch(/\/invite\/abc12345$/);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'Invite link copied' }),
    );
  });

  it('renders the OAuth name for the owner instead of the raw user UUID', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-1-abcdef',
        email: 'jordan@example.com',
        name: 'Jordan Smith',
        hasPasskey: false,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      webAuthnSupported: false,
      isDemoMode: false,
      isOffline: false,
      showPasskeyPrompt: false,
      dismissPasskeyPrompt: vi.fn(),
      loginWithEmail: vi.fn(),
      loginWithPasskey: vi.fn(),
      loginWithOAuth: vi.fn(),
      registerNewPasskey: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      refresh: vi.fn(),
      signupWithEmail: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember({ displayName: null, userId: 'user-1-abcdef' })],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Jordan Smith')).toBeInTheDocument();
    // The raw UUID must not appear.
    expect(screen.queryByText(/user-1-a/)).not.toBeInTheDocument();
  });

  it('falls back to the email address when no OAuth name is available', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-1-abcdef',
        email: 'jordan@example.com',
        hasPasskey: false,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      webAuthnSupported: false,
      isDemoMode: false,
      isOffline: false,
      showPasskeyPrompt: false,
      dismissPasskeyPrompt: vi.fn(),
      loginWithEmail: vi.fn(),
      loginWithPasskey: vi.fn(),
      loginWithOAuth: vi.fn(),
      registerNewPasskey: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      refresh: vi.fn(),
      signupWithEmail: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember({ displayName: null, userId: 'user-1-abcdef' })],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
  });

  it('renders account sharing toggles with privacy labels', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        accountSharings: [
          {
            id: 'as-1',
            accountId: 'acct-checking',
            householdId: 'hh-1',
            ownerId: 'user-1',
            sharingMode: 'SHARED',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    // Account sharing section exists
    expect(screen.getByText('Account Sharing')).toBeInTheDocument();
    expect(screen.getByText('Checking Account')).toBeInTheDocument();

    // Privacy boundary note exists
    expect(screen.getByText(/privacy boundary/i)).toBeInTheDocument();

    // Shared account has toggle
    const toggles = screen.getAllByRole('switch');
    expect(toggles.length).toBeGreaterThan(0);
  });

  it('renders shared budget controls with mode selector', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        sharedBudgets: [
          {
            id: 'sb-1',
            householdId: 'hh-1',
            budgetId: 'budget-groceries',
            mode: 'FLEX',
            isActive: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Shared Budgets')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('renders shared goals with toggle', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        sharedGoals: [
          {
            id: 'sg-1',
            householdId: 'hh-1',
            goalId: 'goal-vacation',
            isShared: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Shared Goals')).toBeInTheDocument();
    expect(screen.getByText('Family Vacation')).toBeInTheDocument();
    expect(screen.getByText('Shared with household')).toBeInTheDocument();
  });

  it('shows role permission reference table', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        checkPermission: vi.fn().mockReturnValue(true),
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Permission Reference')).toBeInTheDocument();
    expect(screen.getByLabelText('Role permissions matrix')).toBeInTheDocument();
  });
});
