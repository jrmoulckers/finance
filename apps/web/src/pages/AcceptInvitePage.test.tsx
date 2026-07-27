// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the household invite-acceptance screen (#3377).
 *
 * Covers the full state matrix the invitee can land in: a valid pending invite
 * (with a working Accept CTA), the four accessible terminal states
 * (not-found / expired / revoked / already-accepted), an inline accept error,
 * the loading guard, and the paste-a-code entry form — plus focus management.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { Household, HouseholdInvitation, HouseholdMember } from '../kmp/bridge';
import { useHousehold } from '../hooks/useHousehold';
import type { AcceptInvitationResult, UseHouseholdResult } from '../hooks/useHousehold';
import { AcceptInvitePage } from './AcceptInvitePage';

vi.mock('../hooks/useHousehold', async () => {
  const actual =
    await vi.importActual<typeof import('../hooks/useHousehold')>('../hooks/useHousehold');
  return { ...actual, useHousehold: vi.fn() };
});

const mockedUseHousehold = vi.mocked(useHousehold);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const baseInvitation: HouseholdInvitation = {
  id: 'inv-1',
  householdId: 'hh-1',
  invitedBy: 'owner-1',
  email: 'partner@example.com',
  role: 'MEMBER',
  status: 'PENDING',
  inviteCode: 'ABC123',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  ...syncMetadata,
};

const baseMember: HouseholdMember = {
  id: 'member-1',
  householdId: 'hh-1',
  userId: 'invitee-2',
  displayName: 'Pat Partner',
  role: 'MEMBER',
  joinedAt: '2025-01-01T00:00:00Z',
  ...syncMetadata,
};

const baseHousehold: Household = {
  id: 'hh-1',
  name: 'Rivera Household',
  ownerId: 'owner-1',
  ...syncMetadata,
};

interface MockOptions {
  household?: Household | null;
  loading?: boolean;
  invitation?: HouseholdInvitation | null;
  acceptResult?: AcceptInvitationResult;
}

function mockHousehold(options: MockOptions = {}) {
  const acceptInvitation = vi
    .fn()
    .mockReturnValue(
      options.acceptResult ??
        ({ status: 'ACCEPTED', member: baseMember } as AcceptInvitationResult),
    );
  const getInvitationByCode = vi.fn().mockReturnValue(options.invitation ?? null);

  mockedUseHousehold.mockReturnValue({
    household: options.household ?? null,
    loading: options.loading ?? false,
    getInvitationByCode,
    acceptInvitation,
  } as unknown as UseHouseholdResult);

  return { acceptInvitation, getInvitationByCode };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invite" element={<AcceptInvitePage />} />
        <Route path="/invite/:code" element={<AcceptInvitePage />} />
        <Route path="/household" element={<div>Household screen</div>} />
        <Route path="/dashboard" element={<div>Dashboard screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the pending invitation with role and a working Accept CTA', async () => {
    const { acceptInvitation } = mockHousehold({
      household: baseHousehold,
      invitation: baseInvitation,
    });

    renderAt('/invite/ABC123');

    // Household name resolves because the local household matches the invite.
    // The invitation loads asynchronously, so wait for the pending card.
    expect(await screen.findByRole('heading', { name: 'Join a household' })).toBeInTheDocument();
    expect(screen.getByText('Rivera Household')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(acceptInvitation).toHaveBeenCalledWith('ABC123');
    // Success state replaces the form.
    expect(await screen.findByRole('heading', { name: "You're in!" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to household' })).toBeInTheDocument();
  });

  it('moves focus to the heading for screen-reader users', async () => {
    mockHousehold({ household: baseHousehold, invitation: baseInvitation });
    renderAt('/invite/ABC123');
    expect(await screen.findByRole('heading', { name: 'Join a household' })).toHaveFocus();
  });

  it('renders a generic household label when the invite is for another household', async () => {
    mockHousehold({
      household: null,
      invitation: baseInvitation,
    });

    renderAt('/invite/ABC123');

    expect(await screen.findByText(/invited to join a shared household/i)).toBeInTheDocument();
  });

  it('shows an accessible not-found state when the invitation is missing', async () => {
    mockHousehold({ invitation: null });

    renderAt('/invite/UNKNOWN');

    expect(
      await screen.findByRole('heading', { name: 'Invitation not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't find that invitation/i);
  });

  it('shows an expired state for an invitation past its expiry', async () => {
    mockHousehold({
      invitation: {
        ...baseInvitation,
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
    });

    renderAt('/invite/ABC123');

    expect(await screen.findByRole('heading', { name: 'Invitation expired' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/has expired/i);
  });

  it('shows a revoked state for a revoked invitation', async () => {
    mockHousehold({
      invitation: { ...baseInvitation, status: 'REVOKED' },
    });

    renderAt('/invite/ABC123');

    expect(await screen.findByRole('heading', { name: 'Invitation revoked' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/was revoked/i);
  });

  it('shows an already-accepted state for an accepted invitation', async () => {
    mockHousehold({
      invitation: { ...baseInvitation, status: 'ACCEPTED' },
    });

    renderAt('/invite/ABC123');

    expect(await screen.findByRole('heading', { name: 'Already accepted' })).toBeInTheDocument();
  });

  it('surfaces an inline error when accepting fails', async () => {
    const { acceptInvitation } = mockHousehold({
      household: baseHousehold,
      invitation: baseInvitation,
      acceptResult: { status: 'ERROR', message: 'Something went wrong.' },
    });

    renderAt('/invite/ABC123');
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));

    expect(acceptInvitation).toHaveBeenCalledWith('ABC123');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    // Still on the pending screen so the invitee can retry.
    expect(screen.getByRole('button', { name: 'Accept invitation' })).toBeInTheDocument();
  });

  it('shows a loading state before the store settles', () => {
    mockHousehold({ loading: true, invitation: null });

    renderAt('/invite/ABC123');

    expect(screen.getByRole('heading', { name: /checking your invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('lets an invitee paste a code and navigates to the invite route', async () => {
    mockHousehold({ invitation: null });

    renderAt('/invite');

    const input = screen.getByLabelText('Invite code');
    const submit = screen.getByRole('button', { name: 'Continue' });
    expect(submit).toBeDisabled();

    fireEvent.change(input, { target: { value: 'XYZ789' } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);

    // Navigated to /invite/XYZ789, which resolves to the not-found state
    // because the default mock has no matching invitation.
    expect(
      await screen.findByRole('heading', { name: 'Invitation not found' }),
    ).toBeInTheDocument();
  });
});
