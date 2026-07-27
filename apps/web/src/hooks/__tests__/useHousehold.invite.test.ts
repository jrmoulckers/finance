// SPDX-License-Identifier: BUSL-1.1

/**
 * Cross-device household invite-acceptance tests (#3377).
 *
 * The critical property these tests protect: an invitation created on one
 * device (the inviter's) can be accepted on a *different* device (the invitee's)
 * whose local store only ever received the invitation row via sync — with the
 * new membership bound to the invitee's own authenticated identity, not a random
 * id. They also lock in the accessible error states the accept screen renders
 * (not-found / expired / revoked / already-accepted) and idempotency.
 */

import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseContext, type DatabaseContextValue } from '../../db/DatabaseProvider';
import type { AsyncDb } from '../../db/async-db';
import type { HouseholdInvitation } from '../../kmp/bridge';
import { useHousehold } from '../useHousehold';

// Two (or more) independent in-memory stores stand in for the encrypted SQLite
// repository on separate devices. `active` points at whichever device is
// "current"; swapping it simulates opening the app on the other device. Only the
// rows we deliberately copy across simulate what sync would have delivered.
const { stores } = vi.hoisted(() => ({
  stores: { active: new Map<string, string>() },
}));

vi.mock('../../db/repositories/householdData', () => ({
  HOUSEHOLD_SINGLETON_KEY: 'finance-household',
  readHouseholdValue: (_db: unknown, key: string, fallback: unknown): unknown =>
    stores.active.has(key) ? JSON.parse(stores.active.get(key) as string) : fallback,
  writeHouseholdValue: (_db: unknown, key: string, value: unknown): void => {
    stores.active.set(key, JSON.stringify(value));
  },
}));

// Controllable authenticated user; each "device" signs in as a different person.
const { auth } = vi.hoisted(() => ({
  auth: { user: null as { id: string; email: string; name?: string } | null },
}));

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({ user: auth.user }),
}));

const INVITATIONS_KEY = 'finance-household-invitations';
const MEMBERS_KEY = 'finance-household-members';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    DatabaseContext.Provider,
    { value: { db: {} as AsyncDb, diagnostics: {} as DatabaseContextValue['diagnostics'] } },
    children,
  );

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
    return arr;
  },
});

beforeEach(() => {
  uuidCounter = 0;
  stores.active = new Map();
  auth.user = null;
  vi.clearAllMocks();
});

/**
 * Render `useHousehold` and flush the async mount-load effect so the hook has
 * finished hydrating from the active device store before the test interacts
 * with it. Mirrors how the app awaits the initial load before user actions.
 */
async function renderHouseholdHook() {
  const utils = renderHook(() => useHousehold(), { wrapper });
  await act(async () => {});
  return utils;
}

/** Parse the invitation rows persisted in a given device store. */
function readInvitations(store: Map<string, string>): HouseholdInvitation[] {
  const raw = store.get(INVITATIONS_KEY);
  return raw ? (JSON.parse(raw) as HouseholdInvitation[]) : [];
}

/** Patch the (single) stored invitation in a device store. */
function patchStoredInvitation(store: Map<string, string>, patch: Partial<HouseholdInvitation>) {
  const invites = readInvitations(store);
  invites[0] = { ...invites[0], ...patch } as HouseholdInvitation;
  store.set(INVITATIONS_KEY, JSON.stringify(invites));
}

/**
 * Seed device A with a household + a pending invitation, returning the created
 * invitation and the raw device-A store. The inviter is signed in as the owner.
 */
async function seedInviteOnDeviceA(): Promise<{
  invitation: HouseholdInvitation;
  deviceA: Map<string, string>;
}> {
  const deviceA = new Map<string, string>();
  stores.active = deviceA;
  auth.user = { id: 'owner-1', email: 'owner@example.com', name: 'Olive Owner' };

  const hook = await renderHouseholdHook();
  act(() => {
    hook.result.current.createHousehold({ name: 'Rivera Household' });
  });
  let invitation: HouseholdInvitation | null = null;
  act(() => {
    invitation = hook.result.current.inviteMember({
      email: 'partner@example.com',
      role: 'MEMBER',
    });
  });
  hook.unmount();

  if (!invitation) {
    throw new Error('Failed to seed invitation on device A');
  }
  return { invitation, deviceA };
}

describe('useHousehold — invite acceptance (#3377)', () => {
  it('accepts an invitation created on device A from a fresh device B store', async () => {
    const { invitation, deviceA } = await seedInviteOnDeviceA();

    // Sync: only the invitation row reaches the invitee's fresh device — the
    // inviter's household + member rows never arrive.
    const deviceB = new Map<string, string>();
    deviceB.set(INVITATIONS_KEY, deviceA.get(INVITATIONS_KEY) as string);

    // Device B: the invitee signs in and opens the invite link.
    stores.active = deviceB;
    auth.user = { id: 'invitee-2', email: 'partner@example.com', name: 'Pat Partner' };

    const deviceBHook = await renderHouseholdHook();

    // The invitation resolves on device B even though its household never synced.
    expect(
      (await deviceBHook.result.current.getInvitationByCode(invitation.inviteCode))?.email,
    ).toBe('partner@example.com');

    let outcome!: Awaited<ReturnType<typeof deviceBHook.result.current.acceptInvitation>>;
    await act(async () => {
      outcome = await deviceBHook.result.current.acceptInvitation(invitation.inviteCode);
    });

    expect(outcome.status).toBe('ACCEPTED');
    if (outcome.status === 'ACCEPTED') {
      // Membership binds to the *invitee's* auth id, not a random one.
      expect(outcome.member.userId).toBe('invitee-2');
      expect(outcome.member.householdId).toBe(invitation.householdId);
      expect(outcome.member.role).toBe('MEMBER');
      expect(outcome.member.displayName).toBe('Pat Partner');
    }

    // Device B persisted the membership and flipped the invitation to ACCEPTED,
    // leaving it unsynced so the change propagates back.
    const persistedMembers = JSON.parse(deviceB.get(MEMBERS_KEY) as string);
    expect(persistedMembers).toHaveLength(1);
    expect(persistedMembers[0].userId).toBe('invitee-2');

    const persistedInvites = readInvitations(deviceB);
    expect(persistedInvites[0]?.status).toBe('ACCEPTED');
    expect(persistedInvites[0]?.isSynced).toBe(false);
  });

  it('falls back to the invitee email for the member display name when no name is set', async () => {
    const { invitation, deviceA } = await seedInviteOnDeviceA();

    const deviceB = new Map<string, string>();
    deviceB.set(INVITATIONS_KEY, deviceA.get(INVITATIONS_KEY) as string);
    stores.active = deviceB;
    auth.user = { id: 'invitee-2', email: 'partner@example.com' };

    const hook = await renderHouseholdHook();
    let outcome!: Awaited<ReturnType<typeof hook.result.current.acceptInvitation>>;
    await act(async () => {
      outcome = await hook.result.current.acceptInvitation(invitation.inviteCode);
    });

    expect(outcome.status).toBe('ACCEPTED');
    if (outcome.status === 'ACCEPTED') {
      expect(outcome.member.displayName).toBe('partner@example.com');
    }
  });

  it('returns NOT_FOUND when no invitation matches the code', async () => {
    stores.active = new Map();
    auth.user = { id: 'invitee-2', email: 'partner@example.com' };

    const { result } = await renderHouseholdHook();
    expect(await result.current.getInvitationByCode('does-not-exist')).toBeNull();

    let outcome!: Awaited<ReturnType<typeof result.current.acceptInvitation>>;
    await act(async () => {
      outcome = await result.current.acceptInvitation('does-not-exist');
    });
    expect(outcome.status).toBe('NOT_FOUND');
  });

  it('returns EXPIRED for an invitation past its expiry and marks it expired in the store', async () => {
    const { invitation, deviceA } = await seedInviteOnDeviceA();

    const deviceB = new Map<string, string>();
    deviceB.set(INVITATIONS_KEY, deviceA.get(INVITATIONS_KEY) as string);
    // Age the invitation out on the invitee's device.
    patchStoredInvitation(deviceB, { expiresAt: new Date(Date.now() - 1_000).toISOString() });

    stores.active = deviceB;
    auth.user = { id: 'invitee-2', email: 'partner@example.com' };

    const hook = await renderHouseholdHook();
    let outcome!: Awaited<ReturnType<typeof hook.result.current.acceptInvitation>>;
    await act(async () => {
      outcome = await hook.result.current.acceptInvitation(invitation.inviteCode);
    });

    expect(outcome.status).toBe('EXPIRED');
    // No membership was created and the row is persisted as EXPIRED.
    expect(deviceB.has(MEMBERS_KEY)).toBe(false);
    expect(readInvitations(deviceB)[0]?.status).toBe('EXPIRED');
  });

  it('returns REVOKED for a revoked invitation', async () => {
    const deviceA = new Map<string, string>();
    stores.active = deviceA;
    auth.user = { id: 'owner-1', email: 'owner@example.com', name: 'Olive Owner' };

    const hook = await renderHouseholdHook();
    act(() => {
      hook.result.current.createHousehold({ name: 'Rivera Household' });
    });
    let invitation!: HouseholdInvitation;
    act(() => {
      invitation = hook.result.current.inviteMember({
        email: 'partner@example.com',
        role: 'MEMBER',
      }) as HouseholdInvitation;
    });
    act(() => {
      hook.result.current.revokeInvitation(invitation.id);
    });

    let outcome!: Awaited<ReturnType<typeof hook.result.current.acceptInvitation>>;
    await act(async () => {
      outcome = await hook.result.current.acceptInvitation(invitation.inviteCode);
    });
    expect(outcome.status).toBe('REVOKED');
  });

  it('is idempotent — a second accept on the same device returns ALREADY_MEMBER', async () => {
    const { invitation, deviceA } = await seedInviteOnDeviceA();

    const deviceB = new Map<string, string>();
    deviceB.set(INVITATIONS_KEY, deviceA.get(INVITATIONS_KEY) as string);
    stores.active = deviceB;
    auth.user = { id: 'invitee-2', email: 'partner@example.com', name: 'Pat Partner' };

    const hook = await renderHouseholdHook();
    let first!: Awaited<ReturnType<typeof hook.result.current.acceptInvitation>>;
    await act(async () => {
      first = await hook.result.current.acceptInvitation(invitation.inviteCode);
    });
    expect(first.status).toBe('ACCEPTED');

    let second!: Awaited<ReturnType<typeof hook.result.current.acceptInvitation>>;
    await act(async () => {
      second = await hook.result.current.acceptInvitation(invitation.inviteCode);
    });
    expect(second.status).toBe('ALREADY_MEMBER');
    if (second.status === 'ALREADY_MEMBER') {
      expect(second.member.userId).toBe('invitee-2');
    }

    // No duplicate membership row was created.
    expect(JSON.parse(deviceB.get(MEMBERS_KEY) as string)).toHaveLength(1);
  });

  it('returns ALREADY_ACCEPTED when a different user opens an already-accepted invite', async () => {
    const { invitation, deviceA } = await seedInviteOnDeviceA();

    // Invitee accepts on device B.
    const deviceB = new Map<string, string>();
    deviceB.set(INVITATIONS_KEY, deviceA.get(INVITATIONS_KEY) as string);
    stores.active = deviceB;
    auth.user = { id: 'invitee-2', email: 'partner@example.com', name: 'Pat Partner' };
    const bHook = await renderHouseholdHook();
    await act(async () => {
      await bHook.result.current.acceptInvitation(invitation.inviteCode);
    });
    bHook.unmount();

    // A different person syncs only the (now ACCEPTED) invitation and tries it.
    const deviceC = new Map<string, string>();
    deviceC.set(INVITATIONS_KEY, deviceB.get(INVITATIONS_KEY) as string);
    stores.active = deviceC;
    auth.user = { id: 'other-3', email: 'other@example.com' };
    const cHook = await renderHouseholdHook();

    let outcome!: Awaited<ReturnType<typeof cHook.result.current.acceptInvitation>>;
    await act(async () => {
      outcome = await cHook.result.current.acceptInvitation(invitation.inviteCode);
    });
    expect(outcome.status).toBe('ALREADY_ACCEPTED');
  });
});
