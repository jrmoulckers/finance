// SPDX-License-Identifier: BUSL-1.1

/**
 * Household Invite Edge Function (#98)
 *
 * Manages the household invitation lifecycle:
 *   POST   — Create a new invitation (returns invite code)
 *   GET    — Validate an invite code and return household info
 *   PUT    — Accept an invitation (add user to household_members)
 *
 * Security:
 *   - POST: Only household owners can create invitations
 *   - GET:  Any authenticated user can validate a code
 *   - PUT:  Any authenticated user can accept a valid invitation
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import {
  createdResponse,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

/** Generate a cryptographically random invite code. */
function generateInviteCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Convert to a URL-safe base64-like string
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 24)
    .toUpperCase();
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    // All operations require authentication
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    const supabase = createAdminClient();

    switch (req.method) {
      case 'POST': {
        // ===================================================================
        // CREATE INVITATION
        // ===================================================================
        const body = await req.json();
        const { household_id, invited_email, role = 'member', expires_in_hours = 72 } = body;

        if (!household_id) {
          return errorResponse(req, 'household_id is required');
        }

        // Verify the requesting user is the household owner
        const { data: household, error: hhError } = await supabase
          .from('households')
          .select('id, name, created_by')
          .eq('id', household_id)
          .is('deleted_at', null)
          .single();

        if (hhError || !household) {
          return errorResponse(req, 'Household not found', 404);
        }

        if (household.created_by !== user.id) {
          return errorResponse(req, 'Only the household owner can create invitations', 403);
        }

        // Check if user is already a member (if email provided)
        if (invited_email) {
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', invited_email)
            .is('deleted_at', null)
            .single();

          if (existingUser) {
            const { data: existingMember } = await supabase
              .from('household_members')
              .select('id')
              .eq('household_id', household_id)
              .eq('user_id', existingUser.id)
              .is('deleted_at', null)
              .single();

            if (existingMember) {
              return errorResponse(req, 'User is already a member of this household', 409);
            }
          }
        }

        // Generate invite code and expiry
        const inviteCode = generateInviteCode();
        const expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString();

        const { data: invitation, error: insertError } = await supabase
          .from('household_invitations')
          .insert({
            household_id,
            invited_by: user.id,
            invite_code: inviteCode,
            invited_email: invited_email ?? null,
            role,
            expires_at: expiresAt,
          })
          .select('id, invite_code, expires_at, role')
          .single();

        if (insertError) {
          console.error('Failed to create invitation:', insertError.message);
          return internalErrorResponse(req);
        }

        return createdResponse(req, {
          id: invitation.id,
          invite_code: invitation.invite_code,
          expires_at: invitation.expires_at,
          role: invitation.role,
          household_name: household.name,
        });
      }

      case 'GET': {
        // ===================================================================
        // VALIDATE INVITE CODE
        // ===================================================================
        const url = new URL(req.url);
        const code = url.searchParams.get('code');

        if (!code) {
          return errorResponse(req, 'code query parameter is required');
        }

        const { data: invitation, error: lookupError } = await supabase
          .from('household_invitations')
          .select(
            `
            id,
            invite_code,
            role,
            expires_at,
            accepted_at,
            invited_email,
            household_id,
            households!inner (
              id,
              name
            )
          `,
          )
          .eq('invite_code', code)
          .is('deleted_at', null)
          .single();

        if (lookupError || !invitation) {
          return errorResponse(req, 'Invalid invitation code', 404);
        }

        // Check if already accepted
        if (invitation.accepted_at) {
          return errorResponse(req, 'This invitation has already been accepted', 410);
        }

        // Check if expired
        if (new Date(invitation.expires_at) < new Date()) {
          return errorResponse(req, 'This invitation has expired', 410);
        }

        // Check if invitation is restricted to a specific email
        if (invitation.invited_email && invitation.invited_email !== user.email) {
          return errorResponse(req, 'This invitation is for a different email address', 403);
        }

        // Return household info (safe subset only)
        const householdInfo = invitation.households as unknown as { id: string; name: string };
        return jsonResponse(req, {
          valid: true,
          household_id: householdInfo.id,
          household_name: householdInfo.name,
          role: invitation.role,
          expires_at: invitation.expires_at,
        });
      }

      case 'PUT': {
        // ===================================================================
        // ACCEPT INVITATION
        // ===================================================================
        const body = await req.json();
        const { invite_code } = body;

        if (!invite_code) {
          return errorResponse(req, 'invite_code is required');
        }

        // Look up the invitation
        const { data: invitation, error: lookupError } = await supabase
          .from('household_invitations')
          .select('*')
          .eq('invite_code', invite_code)
          .is('deleted_at', null)
          .single();

        if (lookupError || !invitation) {
          return errorResponse(req, 'Invalid invitation code', 404);
        }

        // Validate invitation state
        if (invitation.accepted_at) {
          return errorResponse(req, 'This invitation has already been accepted', 410);
        }

        if (new Date(invitation.expires_at) < new Date()) {
          return errorResponse(req, 'This invitation has expired', 410);
        }

        if (invitation.invited_email && invitation.invited_email !== user.email) {
          return errorResponse(req, 'This invitation is for a different email address', 403);
        }

        // Check if user is already a member
        const { data: existingMember } = await supabase
          .from('household_members')
          .select('id')
          .eq('household_id', invitation.household_id)
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .single();

        if (existingMember) {
          return errorResponse(req, 'You are already a member of this household', 409);
        }

        // Add user to household in a transaction-like sequence
        // 1. Create household membership
        const { error: memberError } = await supabase.from('household_members').insert({
          household_id: invitation.household_id,
          user_id: user.id,
          role: invitation.role,
        });

        if (memberError) {
          console.error('Failed to add member:', memberError.message);
          return internalErrorResponse(req);
        }

        // 2. Mark invitation as accepted
        const { error: acceptError } = await supabase
          .from('household_invitations')
          .update({
            accepted_at: new Date().toISOString(),
            accepted_by: user.id,
          })
          .eq('id', invitation.id);

        if (acceptError) {
          console.error('Failed to mark invitation as accepted:', acceptError.message);
          // Membership was already created, so this is a partial failure
          // The invitation can be cleaned up later
        }

        // Get household name for response
        const { data: household } = await supabase
          .from('households')
          .select('name')
          .eq('id', invitation.household_id)
          .single();

        return jsonResponse(req, {
          message: 'Invitation accepted',
          household_id: invitation.household_id,
          household_name: household?.name ?? 'Unknown',
          role: invitation.role,
        });
      }

      default:
        return methodNotAllowedResponse(req);
    }
  } catch (err) {
    console.error('Household invite error:', (err as Error).message);
    return internalErrorResponse(req);
  }
});
