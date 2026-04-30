// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useHousehold } from '../hooks/useHousehold';
import type { UseHouseholdResult } from '../hooks/useHousehold';
import { HouseholdPage } from './HouseholdPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../hooks/useHousehold', () => ({
  useHousehold: vi.fn(),
}));

const mockedUseHousehold = vi.mocked(useHousehold);

function mockHouseholdResult(overrides: Partial<UseHouseholdResult> = {}): UseHouseholdResult {
  return {
    household: null,
    members: [],
    invitations: [],
    budgetVisibility: [],
    loading: false,
    error: null,
    createHousehold: vi.fn(),
    inviteMember: vi.fn(),
    revokeInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    toggleBudgetVisibility: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HouseholdPage', () => {
  beforeEach(() => {
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

  it('renders household management when household exists', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: {
          id: 'hh-1',
          name: 'Smith Family',
          ownerId: 'user-1',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: true,
        },
        members: [
          {
            id: 'mem-1',
            householdId: 'hh-1',
            userId: 'user-1-abcdef',
            role: 'OWNER',
            joinedAt: '2025-01-01T00:00:00Z',
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

    expect(screen.getByText('Smith Family')).toBeInTheDocument();
    expect(screen.getByText('Family Plan')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Invite Member')).toBeInTheDocument();
    expect(screen.getByText('Budget Sharing')).toBeInTheDocument();
  });

  it('displays error banner when error exists', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: {
          id: 'hh-1',
          name: 'Test',
          ownerId: 'user-1',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: true,
        },
        error: 'Something went wrong',
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('shows pending invitations section when invitations exist', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: {
          id: 'hh-1',
          name: 'Test',
          ownerId: 'user-1',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: true,
        },
        invitations: [
          {
            id: 'inv-1',
            householdId: 'hh-1',
            email: 'partner@example.com',
            role: 'PARTNER',
            status: 'pending',
            createdAt: '2025-01-01T00:00:00Z',
            expiresAt: '2025-01-08T00:00:00Z',
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Pending Invitations')).toBeInTheDocument();
    expect(screen.getByText('partner@example.com')).toBeInTheDocument();
  });

  it('renders budget sharing toggles', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: {
          id: 'hh-1',
          name: 'Test',
          ownerId: 'user-1',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: true,
        },
        budgetVisibility: [{ budgetId: 'budget-1', isShared: true }],
      }),
    );

    render(<HouseholdPage />);

    const toggles = screen.getAllByRole('switch');
    expect(toggles.length).toBe(3);
    expect(toggles[0]).toHaveAttribute('aria-checked', 'true');
    expect(toggles[1]).toHaveAttribute('aria-checked', 'false');
  });
});
