// SPDX-License-Identifier: BUSL-1.1

/**
 * Referral Tracking Edge Function (#sprint-7)
 *
 * Manages the referral lifecycle:
 *   POST /referral?action=generate  — Generate a unique referral code for the user
 *   POST /referral?action=accept    — Accept a referral code (new user)
 *   POST /referral?action=reward    — Apply rewards for a completed referral
 *   GET  /referral                  — List the user's referrals (as referrer)
 *
 * Security:
 *   - Requires authentication (Bearer JWT)
 *   - Rate-limited: 20 requests/minute per user
 *   - Self-referral prevented by DB constraint + application check
 *   - Duplicate referrals prevented by unique index
 *   - Monetary rewards stored as BIGINT cents — never floats
 *   - Never logs/returns financial amounts in error responses
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
} from '../_shared/response.ts';

/** Generate a cryptographically random referral code. */
function generateReferralCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 16)
    .toUpperCase();
}

/** Columns safe to return to clients. */
const SAFE_COLUMNS =
  'id, referrer_id, referee_id, referral_code, status, reward_type, accepted_at, expires_at, created_at, updated_at';

/** Referral expiry duration: 90 days. */
const REFERRAL_EXPIRY_DAYS = 90;

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('referral');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('referral', req);
  if (envError) return envError;

  try {
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['referral']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['referral']);
    }

    const url = new URL(req.url);

    if (req.method === 'GET') {
      // ===================================================================
      // LIST USER'S REFERRALS (as referrer)
      // ===================================================================
      const { data: referrals, error: listErr } = await supabase
        .from('referrals')
        .select(SAFE_COLUMNS)
        .eq('referrer_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (listErr) {
        logger.error('Failed to list referrals', { errorMessage: listErr.message });
        return internalErrorResponse(req);
      }

      logger.info('Referrals listed', { httpStatus: 200, count: referrals?.length ?? 0 });
      return jsonResponse(req, { referrals: referrals ?? [] });
    }

    if (req.method !== 'POST') {
      return methodNotAllowedResponse(req);
    }

    const action = url.searchParams.get('action');

    switch (action) {
      case 'generate': {
        // ===============================================================
        // GENERATE REFERRAL CODE
        // ===============================================================

        // Check if user already has an active referral code
        const { data: existing } = await supabase
          .from('referrals')
          .select('id, referral_code')
          .eq('referrer_id', user.id)
          .is('referee_id', null)
          .is('deleted_at', null)
          .eq('status', 'pending')
          .single();

        if (existing) {
          // Return existing code instead of creating a new one
          logger.info('Returning existing referral code', { httpStatus: 200 });
          return jsonResponse(req, {
            referral_code: existing.referral_code,
            message: 'Existing active referral code returned',
          });
        }

        const code = generateReferralCode();
        const expiresAt = new Date(
          Date.now() + REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { data: referral, error: insertErr } = await supabase
          .from('referrals')
          .insert({
            referrer_id: user.id,
            referral_code: code,
            status: 'pending',
            expires_at: expiresAt,
          })
          .select(SAFE_COLUMNS)
          .single();

        if (insertErr) {
          logger.error('Failed to create referral', { errorMessage: insertErr.message });
          return internalErrorResponse(req);
        }

        logger.info('Referral code generated', { httpStatus: 201 });
        return createdResponse(req, { referral });
      }

      case 'accept': {
        // ===============================================================
        // ACCEPT A REFERRAL CODE
        // ===============================================================
        let body: Record<string, unknown>;
        try {
          body = await req.json();
        } catch {
          return errorResponse(req, 'Invalid JSON body');
        }

        const { referral_code } = body as { referral_code?: string };

        if (!referral_code || typeof referral_code !== 'string') {
          return errorResponse(req, 'referral_code is required');
        }

        // Look up the referral
        const { data: referral, error: lookupErr } = await supabase
          .from('referrals')
          .select('id, referrer_id, referee_id, status, expires_at')
          .eq('referral_code', referral_code)
          .is('deleted_at', null)
          .single();

        if (lookupErr || !referral) {
          return errorResponse(req, 'Invalid referral code', 404);
        }

        // Self-referral check (defence in depth — DB constraint also catches this)
        if (referral.referrer_id === user.id) {
          return errorResponse(req, 'You cannot use your own referral code', 400);
        }

        // Already accepted
        if (referral.status !== 'pending') {
          return errorResponse(req, 'This referral code has already been used', 410);
        }

        // Check expiry
        if (referral.expires_at && new Date(referral.expires_at) < new Date()) {
          return errorResponse(req, 'This referral code has expired', 410);
        }

        // Check if user has already been referred
        const { data: existingReferee } = await supabase
          .from('referrals')
          .select('id')
          .eq('referee_id', user.id)
          .is('deleted_at', null)
          .single();

        if (existingReferee) {
          return errorResponse(req, 'You have already been referred', 409);
        }

        // Accept the referral (service role bypasses RLS)
        const { data: accepted, error: updateErr } = await supabase
          .from('referrals')
          .update({
            referee_id: user.id,
            status: 'accepted',
            accepted_at: new Date().toISOString(),
          })
          .eq('id', referral.id)
          .select(SAFE_COLUMNS)
          .single();

        if (updateErr) {
          logger.error('Failed to accept referral', { errorMessage: updateErr.message });
          return internalErrorResponse(req);
        }

        logger.info('Referral accepted', { httpStatus: 200 });
        return jsonResponse(req, {
          message: 'Referral accepted successfully',
          referral: accepted,
        });
      }

      case 'reward': {
        // ===============================================================
        // APPLY REWARD (service-to-service, but also user-callable to check)
        // ===============================================================
        let body: Record<string, unknown>;
        try {
          body = await req.json();
        } catch {
          return errorResponse(req, 'Invalid JSON body');
        }

        const { referral_id, reward_type } = body as {
          referral_id?: string;
          reward_type?: string;
        };

        if (!referral_id) {
          return errorResponse(req, 'referral_id is required');
        }

        const validRewardTypes = ['free_month', 'discount_cents', 'premium_trial'];
        if (!reward_type || !validRewardTypes.includes(reward_type)) {
          return errorResponse(req, `Invalid reward_type. Valid: ${validRewardTypes.join(', ')}`);
        }

        // Fetch the referral — must be accepted and not yet rewarded
        const { data: referral, error: lookupErr } = await supabase
          .from('referrals')
          .select('id, referrer_id, status')
          .eq('id', referral_id)
          .is('deleted_at', null)
          .single();

        if (lookupErr || !referral) {
          return errorResponse(req, 'Referral not found', 404);
        }

        // Only the referrer can trigger reward application
        if (referral.referrer_id !== user.id) {
          return errorResponse(req, 'Only the referrer can apply rewards', 403);
        }

        if (referral.status !== 'accepted') {
          return errorResponse(req, 'Referral must be in accepted status to apply rewards', 400);
        }

        // Apply the reward (service role)
        const { data: rewarded, error: rewardErr } = await supabase
          .from('referrals')
          .update({
            reward_type,
            status: 'rewarded',
            reward_applied_at: new Date().toISOString(),
          })
          .eq('id', referral_id)
          .select(SAFE_COLUMNS)
          .single();

        if (rewardErr) {
          logger.error('Failed to apply reward', { errorMessage: rewardErr.message });
          return internalErrorResponse(req);
        }

        logger.info('Referral reward applied', { httpStatus: 200 });
        return jsonResponse(req, {
          message: 'Reward applied successfully',
          referral: rewarded,
        });
      }

      default:
        return errorResponse(
          req,
          'Invalid action. Valid: generate, accept, reward. Use GET for listing.',
        );
    }
  } catch (err) {
    logger.error('Referral error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
