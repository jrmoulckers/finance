// SPDX-License-Identifier: BUSL-1.1

/**
 * Consent Management Edge Function (#1100 — GDPR Critical)
 *
 * Records and queries GDPR consent actions (grant/withdrawal) for
 * authenticated users. Consent records are immutable — once recorded,
 * they cannot be modified or deleted (GDPR Articles 6, 7, 8).
 *
 * Endpoints:
 *   GET  /consent-management              → List current consent status for user
 *   GET  /consent-management?type=...     → Check specific consent type
 *   POST /consent-management              → Record a consent action
 *   GET  /consent-management?history=true → Full consent history (audit trail)
 *
 * Security:
 *   - Requires authentication (users manage only their own consent)
 *   - IP address captured automatically from request headers
 *   - Consent records are append-only (no UPDATE/DELETE)
 *   - NEVER log consent details or IP addresses
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { validateEnv } from '../_shared/env.ts';
import {
  checkRateLimit,
  rateLimitResponse,
  appendRateLimitHeaders,
  getClientIp,
  RATE_LIMITS,
} from '../_shared/rate-limit.ts';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

/** Valid consent types — must match the CHECK constraint in the migration. */
const VALID_CONSENT_TYPES = new Set([
  'terms_of_service',
  'privacy_policy',
  'data_processing',
  'marketing_email',
  'analytics',
  'third_party_sharing',
  'biometric_data',
]);

/** Valid consent statuses. */
const VALID_STATUSES = new Set(['granted', 'withdrawn']);

/** Semver pattern for policy_version validation. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

serve(async (req: Request): Promise<Response> => {
  // -------------------------------------------------------------------------
  // CORS preflight
  // -------------------------------------------------------------------------
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('consent-management');
  logger.info('Request received', { method: req.method });

  // -------------------------------------------------------------------------
  // Environment validation
  // -------------------------------------------------------------------------
  const envError = validateEnv('consent-management', req);
  if (envError) return envError;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowedResponse(req);
  }

  try {
    // -----------------------------------------------------------------------
    // Authentication
    // -----------------------------------------------------------------------
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);

    const supabase = createAdminClient();

    // -----------------------------------------------------------------------
    // Rate limiting
    // -----------------------------------------------------------------------
    const rateLimitConfig = RATE_LIMITS['consent-management'];
    const rateLimitResult = await checkRateLimit(supabase, user.id, rateLimitConfig);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, rateLimitConfig);
    }

    const url = new URL(req.url);

    // =======================================================================
    // GET — Query consent status
    // =======================================================================
    if (req.method === 'GET') {
      const consentType = url.searchParams.get('type');
      const showHistory = url.searchParams.get('history') === 'true';

      if (consentType && !VALID_CONSENT_TYPES.has(consentType)) {
        return errorResponse(req, `Invalid consent type: ${consentType}`);
      }

      if (showHistory) {
        // Full history for audit trail
        let query = supabase
          .from('user_consents')
          .select('id, consent_type, status, policy_version, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (consentType) {
          query = query.eq('consent_type', consentType);
        }

        const { data: history, error: historyError } = await query;

        if (historyError) {
          logger.error('Failed to fetch consent history', {
            errorMessage: historyError.message,
          });
          return internalErrorResponse(req);
        }

        logger.info('Consent history retrieved', {
          httpStatus: 200,
          count: history?.length ?? 0,
        });

        const response = jsonResponse(req, {
          consents: history ?? [],
          count: history?.length ?? 0,
        });
        return appendRateLimitHeaders(response, rateLimitResult, rateLimitConfig);
      }

      // Current status — use the RPC for efficient DISTINCT ON query
      const { data: statuses, error: statusError } = await supabase.rpc(
        'get_user_consent_status',
        {
          p_user_id: user.id,
          p_consent_type: consentType ?? null,
        },
      );

      if (statusError) {
        logger.error('Failed to fetch consent status', {
          errorMessage: statusError.message,
        });
        return internalErrorResponse(req);
      }

      logger.info('Consent status retrieved', {
        httpStatus: 200,
        count: Array.isArray(statuses) ? statuses.length : 0,
      });

      const response = jsonResponse(req, {
        consents: statuses ?? [],
      });
      return appendRateLimitHeaders(response, rateLimitResult, rateLimitConfig);
    }

    // =======================================================================
    // POST — Record consent action
    // =======================================================================
    if (req.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse(req, 'Invalid JSON body');
      }

      const { consent_type, status, policy_version, metadata } = body;

      // Validate consent_type
      if (!consent_type || typeof consent_type !== 'string') {
        return errorResponse(req, 'consent_type is required');
      }
      if (!VALID_CONSENT_TYPES.has(consent_type)) {
        return errorResponse(
          req,
          `Invalid consent_type. Must be one of: ${Array.from(VALID_CONSENT_TYPES).join(', ')}`,
        );
      }

      // Validate status
      if (!status || typeof status !== 'string') {
        return errorResponse(req, 'status is required (granted or withdrawn)');
      }
      if (!VALID_STATUSES.has(status)) {
        return errorResponse(req, 'status must be "granted" or "withdrawn"');
      }

      // Validate policy_version
      if (!policy_version || typeof policy_version !== 'string') {
        return errorResponse(req, 'policy_version is required (semver format, e.g. "1.0.0")');
      }
      if (!SEMVER_PATTERN.test(policy_version)) {
        return errorResponse(req, 'policy_version must be in semver format (e.g. "1.0.0")');
      }

      // Validate optional metadata
      if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null)) {
        return errorResponse(req, 'metadata must be a JSON object if provided');
      }

      // Capture client IP for GDPR audit trail
      const clientIp = getClientIp(req);

      // Insert the consent record
      const { data: consent, error: insertError } = await supabase
        .from('user_consents')
        .insert({
          user_id: user.id,
          consent_type,
          status,
          policy_version,
          ip_address: clientIp,
          user_agent: req.headers.get('user-agent')?.substring(0, 512) ?? null,
          metadata: metadata ?? {},
        })
        .select('id, consent_type, status, policy_version, created_at')
        .single();

      if (insertError) {
        logger.error('Failed to record consent', {
          errorMessage: insertError.message,
        });
        return internalErrorResponse(req);
      }

      logger.info('Consent recorded', {
        httpStatus: 201,
        consentType: consent_type as string,
        consentStatus: status as string,
      });

      const response = jsonResponse(
        req,
        {
          consent,
          message: `Consent ${status === 'granted' ? 'granted' : 'withdrawn'} successfully`,
        },
        201,
      );
      return appendRateLimitHeaders(response, rateLimitResult, rateLimitConfig);
    }

    return methodNotAllowedResponse(req);
  } catch (err) {
    logger.error('consent-management error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
