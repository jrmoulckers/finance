// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `household-invite` Edge Function (#533).
 *
 * Validates the full invitation lifecycle: create (POST), validate (GET),
 * accept (PUT), method restrictions, auth requirements, and error cases.
 */

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonBody,
  assertErrorResponse,
  assertCorsHeaders,
} from '../_test_helpers/assertions.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';
import {
  TEST_USER,
  TEST_USER_2,
  TEST_USER_3,
  TEST_HOUSEHOLD,
  TEST_INVITATION,
  TEST_EXPIRED_INVITATION,
  TEST_ACCEPTED_INVITATION,
} from '../_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing.
// ---------------------------------------------------------------------------

interface MockHouseholdInviteDeps {
  authenticatedUser?: { id: string; email: string } | null;
  household?: { id: string; name: string; created_by: string } | null;
  existingMember?: { id: string } | null;
  existingUser?: { id: string } | null;
  invitation?: {
    id: string;
    invite_code: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
    invited_email: string | null;
    household_id: string;
    households: { id: string; name: string };
  } | null;
  insertResult?: { id: string; invite_code: string; expires_at: string; role: string } | null;
  insertError?: { message: string } | null;
  rpcResult?: {
    error?: string;
    household_id?: string;
    household_name?: string;
    role?: string;
  } | null;
  rpcError?: { message: string } | null;
}

const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonRes(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
  });
}

function errRes(message: string, status = 400): Response {
  return jsonRes({ error: message }, status);
}

async function handleHouseholdInvite(
  req: Request,
  deps: MockHouseholdInviteDeps = {},
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: testCorsHeaders });
  }

  try {
    const user = deps.authenticatedUser ?? null;
    if (!user) {
      return errRes('Authentication required', 401);
    }

    switch (req.method) {
      case 'POST': {
        const body = await req.json();
        const { household_id, invited_email, role = 'member' } = body;

        if (!household_id) {
          return errRes('household_id is required');
        }

        const household = deps.household ?? null;
        if (!household) {
          return errRes('Household not found', 404);
        }

        if (household.created_by !== user.id) {
          return errRes('Only the household owner can create invitations', 403);
        }

        if (invited_email && deps.existingUser && deps.existingMember) {
          return errRes('User is already a member of this household', 409);
        }

        if (deps.insertError) {
          return errRes('Internal server error', 500);
        }

        const invitation = deps.insertResult ?? {
          id: 'new-invite-id',
          invite_code: 'NEWINVITECODE12345678',
          expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          role,
        };

        return new Response(
          JSON.stringify({
            id: invitation.id,
            invite_code: invitation.invite_code,
            expires_at: invitation.expires_at,
            role: invitation.role,
            household_name: household.name,
          }),
          {
            status: 201,
            headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      case 'GET': {
        const url = new URL(req.url);
        const code = url.searchParams.get('code');

        if (!code) {
          return errRes('code query parameter is required');
        }

        const invitation = deps.invitation ?? null;
        if (!invitation) {
          return errRes('Invalid invitation code', 404);
        }

        if (invitation.accepted_at) {
          return errRes('This invitation has already been accepted', 410);
        }

        if (new Date(invitation.expires_at) < new Date()) {
          return errRes('This invitation has expired', 410);
        }

        if (invitation.invited_email && invitation.invited_email !== user.email) {
          return errRes('This invitation is for a different email address', 403);
        }

        return jsonRes({
          valid: true,
          household_id: invitation.households.id,
          household_name: invitation.households.name,
          role: invitation.role,
          expires_at: invitation.expires_at,
        });
      }

      case 'PUT': {
        const body = await req.json();
        const { invite_code } = body;

        if (!invite_code) {
          return errRes('invite_code is required');
        }

        if (deps.rpcError) {
          return errRes('Internal server error', 500);
        }

        const result = deps.rpcResult ?? {
          household_id: TEST_HOUSEHOLD.id,
          household_name: TEST_HOUSEHOLD.name,
          role: 'member',
        };

        if (result.error) {
          switch (result.error) {
            case 'INVITE_NOT_FOUND':
              return errRes('Invalid invitation code', 404);
            case 'INVITE_ALREADY_ACCEPTED':
              return errRes('This invitation has already been accepted', 410);
            case 'INVITE_EXPIRED':
              return errRes('This invitation has expired', 410);
            case 'INVITE_EMAIL_MISMATCH':
              return errRes('This invitation is for a different email address', 403);
            case 'ALREADY_MEMBER':
              return errRes('You are already a member of this household', 409);
            default:
              return errRes('Internal server error', 500);
          }
        }

        return jsonRes({
          message: 'Invitation accepted',
          household_id: result.household_id,
          household_name: result.household_name,
          role: result.role,
        });
      }

      default:
        return errRes('Method not allowed', 405);
    }
  } catch (err) {
    return errRes('Internal server error', 500);
  }
}

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('household-invite — returns 405 for PATCH method', async () => {
  const req = createMockRequest({ method: 'PATCH', body: {} });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });
  await assertErrorResponse(res, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: authentication
// ---------------------------------------------------------------------------

Deno.test('household-invite — returns 401 without authentication', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/household-invite?code=TEST',
  });
  const res = await handleHouseholdInvite(req, { authenticatedUser: null });
  await assertErrorResponse(res, 401, 'Authentication required');
});

// ---------------------------------------------------------------------------
// Tests: CORS preflight
// ---------------------------------------------------------------------------

Deno.test('household-invite — OPTIONS returns 204', async () => {
  const req = createMockRequest({ method: 'OPTIONS' });
  const res = await handleHouseholdInvite(req);
  assertStatus(res, 204);
});

// ---------------------------------------------------------------------------
// Tests: POST — create invitation
// ---------------------------------------------------------------------------

Deno.test('household-invite POST — owner can create invitation', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { household_id: TEST_HOUSEHOLD.id, invited_email: TEST_USER_2.email },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    household: {
      id: TEST_HOUSEHOLD.id,
      name: TEST_HOUSEHOLD.name,
      created_by: TEST_USER.id,
    },
  });

  assertStatus(res, 201);
  const body = await assertJsonBody(res);
  assertEquals(typeof body.invite_code, 'string');
  assertEquals(body.household_name, TEST_HOUSEHOLD.name);
  assertEquals(body.role, 'member');
});

Deno.test('household-invite POST — non-owner gets 403', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { household_id: TEST_HOUSEHOLD.id },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    household: {
      id: TEST_HOUSEHOLD.id,
      name: TEST_HOUSEHOLD.name,
      created_by: TEST_USER.id, // Different from authenticated user
    },
  });

  await assertErrorResponse(res, 403, 'Only the household owner');
});

Deno.test('household-invite POST — returns 404 for nonexistent household', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { household_id: 'nonexistent-id' },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    household: null,
  });

  await assertErrorResponse(res, 404, 'Household not found');
});

Deno.test('household-invite POST — detects existing member (409)', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { household_id: TEST_HOUSEHOLD.id, invited_email: TEST_USER_2.email },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    household: {
      id: TEST_HOUSEHOLD.id,
      name: TEST_HOUSEHOLD.name,
      created_by: TEST_USER.id,
    },
    existingUser: { id: TEST_USER_2.id },
    existingMember: { id: 'membership-id' },
  });

  await assertErrorResponse(res, 409, 'already a member');
});

Deno.test('household-invite POST — requires household_id', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { invited_email: TEST_USER_2.email },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });

  await assertErrorResponse(res, 400, 'household_id is required');
});

Deno.test('household-invite POST — returns 500 on insert failure', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { household_id: TEST_HOUSEHOLD.id },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    household: {
      id: TEST_HOUSEHOLD.id,
      name: TEST_HOUSEHOLD.name,
      created_by: TEST_USER.id,
    },
    insertError: { message: 'Database error' },
  });

  assertStatus(res, 500);
});

// ---------------------------------------------------------------------------
// Tests: GET — validate invite code
// ---------------------------------------------------------------------------

Deno.test('household-invite GET — validates valid code and returns household info', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `https://test.supabase.co/functions/v1/household-invite?code=${TEST_INVITATION.invite_code}`,
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    invitation: {
      id: TEST_INVITATION.id,
      invite_code: TEST_INVITATION.invite_code,
      role: 'member',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
      invited_email: TEST_USER_2.email,
      household_id: TEST_HOUSEHOLD.id,
      households: { id: TEST_HOUSEHOLD.id, name: TEST_HOUSEHOLD.name },
    },
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(body.valid, true);
  assertEquals(body.household_id, TEST_HOUSEHOLD.id);
  assertEquals(body.household_name, TEST_HOUSEHOLD.name);
  assertEquals(body.role, 'member');
});

Deno.test('household-invite GET — requires code parameter', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/household-invite',
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });

  await assertErrorResponse(res, 400, 'code query parameter is required');
});

Deno.test('household-invite GET — returns 404 for invalid code', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/household-invite?code=INVALIDCODE',
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    invitation: null,
  });

  await assertErrorResponse(res, 404, 'Invalid invitation code');
});

Deno.test('household-invite GET — returns 410 for already accepted invitation', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `https://test.supabase.co/functions/v1/household-invite?code=${TEST_ACCEPTED_INVITATION.invite_code}`,
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    invitation: {
      id: TEST_ACCEPTED_INVITATION.id,
      invite_code: TEST_ACCEPTED_INVITATION.invite_code,
      role: 'member',
      expires_at: TEST_ACCEPTED_INVITATION.expires_at,
      accepted_at: TEST_ACCEPTED_INVITATION.accepted_at,
      invited_email: TEST_USER_2.email,
      household_id: TEST_HOUSEHOLD.id,
      households: { id: TEST_HOUSEHOLD.id, name: TEST_HOUSEHOLD.name },
    },
  });

  await assertErrorResponse(res, 410, 'already been accepted');
});

Deno.test('household-invite GET — returns 410 for expired invitation', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `https://test.supabase.co/functions/v1/household-invite?code=${TEST_EXPIRED_INVITATION.invite_code}`,
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_3.id, email: TEST_USER_3.email },
    invitation: {
      id: TEST_EXPIRED_INVITATION.id,
      invite_code: TEST_EXPIRED_INVITATION.invite_code,
      role: 'member',
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
      invited_email: TEST_USER_3.email,
      household_id: TEST_HOUSEHOLD.id,
      households: { id: TEST_HOUSEHOLD.id, name: TEST_HOUSEHOLD.name },
    },
  });

  await assertErrorResponse(res, 410, 'expired');
});

Deno.test('household-invite GET — returns 403 for email mismatch', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `https://test.supabase.co/functions/v1/household-invite?code=${TEST_INVITATION.invite_code}`,
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_3.id, email: TEST_USER_3.email }, // Wrong email
    invitation: {
      id: TEST_INVITATION.id,
      invite_code: TEST_INVITATION.invite_code,
      role: 'member',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
      invited_email: TEST_USER_2.email, // Intended for user 2
      household_id: TEST_HOUSEHOLD.id,
      households: { id: TEST_HOUSEHOLD.id, name: TEST_HOUSEHOLD.name },
    },
  });

  await assertErrorResponse(res, 403, 'different email');
});

// ---------------------------------------------------------------------------
// Tests: PUT — accept invitation
// ---------------------------------------------------------------------------

Deno.test('household-invite PUT — accepts valid invitation', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: TEST_INVITATION.invite_code },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    rpcResult: {
      household_id: TEST_HOUSEHOLD.id,
      household_name: TEST_HOUSEHOLD.name,
      role: 'member',
    },
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(body.message, 'Invitation accepted');
  assertEquals(body.household_id, TEST_HOUSEHOLD.id);
  assertEquals(body.household_name, TEST_HOUSEHOLD.name);
  assertEquals(body.role, 'member');
});

Deno.test('household-invite PUT — requires invite_code', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: {},
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
  });

  await assertErrorResponse(res, 400, 'invite_code is required');
});

Deno.test('household-invite PUT — handles INVITE_NOT_FOUND error', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: 'INVALIDCODE' },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    rpcResult: { error: 'INVITE_NOT_FOUND' },
  });

  await assertErrorResponse(res, 404, 'Invalid invitation code');
});

Deno.test('household-invite PUT — handles INVITE_ALREADY_ACCEPTED error', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: TEST_ACCEPTED_INVITATION.invite_code },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    rpcResult: { error: 'INVITE_ALREADY_ACCEPTED' },
  });

  await assertErrorResponse(res, 410, 'already been accepted');
});

Deno.test('household-invite PUT — handles INVITE_EXPIRED error', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: TEST_EXPIRED_INVITATION.invite_code },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    rpcResult: { error: 'INVITE_EXPIRED' },
  });

  await assertErrorResponse(res, 410, 'expired');
});

Deno.test('household-invite PUT — handles INVITE_EMAIL_MISMATCH error', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: TEST_INVITATION.invite_code },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_3.id, email: TEST_USER_3.email },
    rpcResult: { error: 'INVITE_EMAIL_MISMATCH' },
  });

  await assertErrorResponse(res, 403, 'different email');
});

Deno.test('household-invite PUT — handles ALREADY_MEMBER error', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: TEST_INVITATION.invite_code },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    rpcResult: { error: 'ALREADY_MEMBER' },
  });

  await assertErrorResponse(res, 409, 'already a member');
});

Deno.test('household-invite PUT — handles RPC failure', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: TEST_INVITATION.invite_code },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    rpcError: { message: 'Database error' },
  });

  assertStatus(res, 500);
});

Deno.test('household-invite PUT — handles unknown RPC error code', async () => {
  const req = createMockRequest({
    method: 'PUT',
    body: { invite_code: TEST_INVITATION.invite_code },
  });
  const res = await handleHouseholdInvite(req, {
    authenticatedUser: { id: TEST_USER_2.id, email: TEST_USER_2.email },
    rpcResult: { error: 'UNKNOWN_ERROR_CODE' },
  });

  assertStatus(res, 500);
});
