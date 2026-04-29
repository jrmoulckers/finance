// SPDX-License-Identifier: BUSL-1.1

/**
 * Family Plan Subscription Management Edge Function (#sprint-6)
 *
 * Manages household premium plan subscriptions:
 *   POST   — Create a new family plan for a household
 *   GET    — Get the current subscription for a household
 *   PUT    — Update subscription (add/remove members, change billing owner)
 *   DELETE — Cancel a subscription
 *
 * Security:
 *   - Requires authentication (Bearer JWT)
 *   - Rate-limited: 20 requests/minute per user
 *   - Household membership enforced via RLS
 *   - Only billing owner can modify the plan
 *   - Max 6 members per family plan
 *   - external_id (payment provider ID) is NEVER returned to clients
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
  createdResponse,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  noContentResponse,
} from '../_shared/response.ts';

/** Valid plan types. */
const VALID_PLAN_TYPES = ['family_premium', 'family_pro', 'family_business'] as const;

/** Valid billing cycles. */
const VALID_BILLING_CYCLES = ['monthly', 'yearly'] as const;

/** Maximum allowed members per family plan. */
const MAX_FAMILY_MEMBERS = 6;

/** Columns safe to return to clients (excludes external_id). */
const SAFE_COLUMNS =
  'id, household_id, billing_owner_id, owner_id, plan_type, status, price_cents, currency_code, billing_cycle, max_members, current_members, started_at, current_period_end, canceled_at, expires_at, created_at, updated_at';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('family-plan');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('family-plan', req);
  if (envError) return envError;

  try {
    // Authentication
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['family-plan']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['family-plan']);
    }

    const url = new URL(req.url);
    const householdId = url.searchParams.get('household_id');

    switch (req.method) {
      case 'POST': {
        // =================================================================
        // CREATE FAMILY PLAN
        // =================================================================
        let body: Record<string, unknown>;
        try {
          body = await req.json();
        } catch {
          return errorResponse(req, 'Invalid JSON body');
        }

        const {
          household_id: bodyHouseholdId,
          plan_type = 'family_premium',
          billing_cycle = 'monthly',
          price_cents,
          currency_code = 'USD',
        } = body as {
          household_id?: string;
          plan_type?: string;
          billing_cycle?: string;
          price_cents?: number;
          currency_code?: string;
        };

        if (!bodyHouseholdId) {
          return errorResponse(req, 'household_id is required');
        }

        if (typeof price_cents !== 'number' || price_cents < 0) {
          return errorResponse(req, 'price_cents must be a non-negative integer');
        }

        if (!(VALID_PLAN_TYPES as readonly string[]).includes(plan_type)) {
          return errorResponse(req, `Invalid plan_type. Valid: ${VALID_PLAN_TYPES.join(', ')}`);
        }

        if (!(VALID_BILLING_CYCLES as readonly string[]).includes(billing_cycle)) {
          return errorResponse(
            req,
            `Invalid billing_cycle. Valid: ${VALID_BILLING_CYCLES.join(', ')}`,
          );
        }

        // Verify user is a household member
        const { data: membership, error: memberErr } = await supabase
          .from('household_members')
          .select('id')
          .eq('household_id', bodyHouseholdId)
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .single();

        if (memberErr || !membership) {
          return errorResponse(req, 'You are not a member of this household', 403);
        }

        // Check for existing active subscription
        const { data: existing } = await supabase
          .from('family_plan_subscriptions')
          .select('id')
          .eq('household_id', bodyHouseholdId)
          .is('deleted_at', null)
          .not('status', 'in', '("canceled","expired")')
          .single();

        if (existing) {
          return errorResponse(req, 'Household already has an active subscription', 409);
        }

        // Count current household members
        const { count: memberCount } = await supabase
          .from('household_members')
          .select('id', { count: 'exact', head: true })
          .eq('household_id', bodyHouseholdId)
          .is('deleted_at', null);

        const { data: plan, error: insertErr } = await supabase
          .from('family_plan_subscriptions')
          .insert({
            household_id: bodyHouseholdId,
            billing_owner_id: user.id,
            owner_id: user.id,
            plan_type,
            billing_cycle,
            price_cents: Math.floor(price_cents),
            currency_code,
            current_members: memberCount ?? 1,
            max_members: MAX_FAMILY_MEMBERS,
            status: 'active',
          })
          .select(SAFE_COLUMNS)
          .single();

        if (insertErr) {
          logger.error('Failed to create family plan', { errorMessage: insertErr.message });
          return internalErrorResponse(req);
        }

        logger.info('Family plan created', { httpStatus: 201 });
        return createdResponse(req, { subscription: plan });
      }

      case 'GET': {
        // =================================================================
        // GET HOUSEHOLD SUBSCRIPTION
        // =================================================================
        if (!householdId) {
          return errorResponse(req, 'household_id query parameter is required');
        }

        const { data: plan, error: fetchErr } = await supabase
          .from('family_plan_subscriptions')
          .select(SAFE_COLUMNS)
          .eq('household_id', householdId)
          .is('deleted_at', null)
          .not('status', 'in', '("canceled","expired")')
          .single();

        if (fetchErr || !plan) {
          return errorResponse(req, 'No active subscription found for this household', 404);
        }

        logger.info('Subscription retrieved', { httpStatus: 200 });
        return jsonResponse(req, { subscription: plan });
      }

      case 'PUT': {
        // =================================================================
        // UPDATE SUBSCRIPTION (add/remove members, change billing owner)
        // =================================================================
        let body: Record<string, unknown>;
        try {
          body = await req.json();
        } catch {
          return errorResponse(req, 'Invalid JSON body');
        }

        const { subscription_id, action, new_billing_owner_id, member_user_id } = body as {
          subscription_id?: string;
          action?: string;
          new_billing_owner_id?: string;
          member_user_id?: string;
        };

        if (!subscription_id) {
          return errorResponse(req, 'subscription_id is required');
        }

        // Fetch the subscription — billing owner check
        const { data: sub, error: subErr } = await supabase
          .from('family_plan_subscriptions')
          .select(SAFE_COLUMNS)
          .eq('id', subscription_id)
          .is('deleted_at', null)
          .single();

        if (subErr || !sub) {
          return errorResponse(req, 'Subscription not found', 404);
        }

        const subscription = sub as Record<string, unknown>;

        if (subscription.billing_owner_id !== user.id) {
          return errorResponse(req, 'Only the billing owner can modify the subscription', 403);
        }

        switch (action) {
          case 'add_member': {
            if (!member_user_id) {
              return errorResponse(req, 'member_user_id is required for add_member');
            }

            if ((subscription.current_members as number) >= (subscription.max_members as number)) {
              return errorResponse(
                req,
                `Family plan is full (max ${subscription.max_members} members)`,
                409,
              );
            }

            // Verify the user to add is a household member
            const { data: isMember } = await supabase
              .from('household_members')
              .select('id')
              .eq('household_id', subscription.household_id as string)
              .eq('user_id', member_user_id)
              .is('deleted_at', null)
              .single();

            if (!isMember) {
              return errorResponse(req, 'User is not a member of the household', 400);
            }

            const { data: updated, error: updErr } = await supabase
              .from('family_plan_subscriptions')
              .update({
                current_members: (subscription.current_members as number) + 1,
              })
              .eq('id', subscription_id)
              .select(SAFE_COLUMNS)
              .single();

            if (updErr) {
              logger.error('Failed to add member', { errorMessage: updErr.message });
              return internalErrorResponse(req);
            }

            logger.info('Member added to plan', { httpStatus: 200 });
            return jsonResponse(req, { subscription: updated });
          }

          case 'remove_member': {
            if (!member_user_id) {
              return errorResponse(req, 'member_user_id is required for remove_member');
            }

            if (member_user_id === (subscription.billing_owner_id as string)) {
              return errorResponse(
                req,
                'Cannot remove the billing owner. Transfer ownership first.',
                400,
              );
            }

            if ((subscription.current_members as number) <= 1) {
              return errorResponse(req, 'Cannot remove the last member', 400);
            }

            const { data: updated, error: updErr } = await supabase
              .from('family_plan_subscriptions')
              .update({
                current_members: (subscription.current_members as number) - 1,
              })
              .eq('id', subscription_id)
              .select(SAFE_COLUMNS)
              .single();

            if (updErr) {
              logger.error('Failed to remove member', { errorMessage: updErr.message });
              return internalErrorResponse(req);
            }

            logger.info('Member removed from plan', { httpStatus: 200 });
            return jsonResponse(req, { subscription: updated });
          }

          case 'transfer_billing': {
            if (!new_billing_owner_id) {
              return errorResponse(req, 'new_billing_owner_id is required for transfer_billing');
            }

            // Verify new owner is a household member
            const { data: newOwnerMembership } = await supabase
              .from('household_members')
              .select('id')
              .eq('household_id', subscription.household_id as string)
              .eq('user_id', new_billing_owner_id)
              .is('deleted_at', null)
              .single();

            if (!newOwnerMembership) {
              return errorResponse(req, 'New billing owner is not a household member', 400);
            }

            const { data: updated, error: updErr } = await supabase
              .from('family_plan_subscriptions')
              .update({ billing_owner_id: new_billing_owner_id })
              .eq('id', subscription_id)
              .select(SAFE_COLUMNS)
              .single();

            if (updErr) {
              logger.error('Failed to transfer billing', { errorMessage: updErr.message });
              return internalErrorResponse(req);
            }

            logger.info('Billing ownership transferred', { httpStatus: 200 });
            return jsonResponse(req, { subscription: updated });
          }

          default:
            return errorResponse(
              req,
              'Invalid action. Valid: add_member, remove_member, transfer_billing',
            );
        }
      }

      case 'DELETE': {
        // =================================================================
        // CANCEL SUBSCRIPTION
        // =================================================================
        if (!householdId) {
          return errorResponse(req, 'household_id query parameter is required');
        }

        const { data: sub, error: subErr } = await supabase
          .from('family_plan_subscriptions')
          .select('id, billing_owner_id')
          .eq('household_id', householdId)
          .is('deleted_at', null)
          .not('status', 'in', '("canceled","expired")')
          .single();

        if (subErr || !sub) {
          return errorResponse(req, 'No active subscription found', 404);
        }

        if (sub.billing_owner_id !== user.id) {
          return errorResponse(req, 'Only the billing owner can cancel the subscription', 403);
        }

        const { error: cancelErr } = await supabase
          .from('family_plan_subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('id', sub.id);

        if (cancelErr) {
          logger.error('Failed to cancel subscription', { errorMessage: cancelErr.message });
          return internalErrorResponse(req);
        }

        logger.info('Subscription canceled', { httpStatus: 204 });
        return noContentResponse(req);
      }

      default:
        return methodNotAllowedResponse(req);
    }
  } catch (err) {
    logger.error('Family plan error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
