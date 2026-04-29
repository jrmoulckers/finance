// SPDX-License-Identifier: BUSL-1.1

/**
 * Consent Management Edge Function (#1100 — GDPR Critical)
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

const VALID_CONSENT_TYPES = new Set([
  'terms_of_service',
  'privacy_policy',
  'data_processing',
  'marketing_email',
  'analytics',
  'third_party_sharing',
  'biometric_data',
]);
const VALID_STATUSES = new Set(['granted', 'withdrawn']);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);
  const logger = createLogger('consent-management');
  logger.info('Request received', { method: req.method });
  const envError = validateEnv('consent-management', req);
  if (envError) return envError;
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowedResponse(req);

  try {
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }
    logger.setUserId(user.id);
    const supabase = createAdminClient();
    const rlCfg = RATE_LIMITS['consent-management'];
    const rl = await checkRateLimit(supabase, user.id, rlCfg);
    if (!rl.allowed) return rateLimitResponse(req, rl, rlCfg);

    const url = new URL(req.url);

    if (req.method === 'GET') {
      const ct = url.searchParams.get('type');
      const history = url.searchParams.get('history') === 'true';
      if (ct && !VALID_CONSENT_TYPES.has(ct))
        return errorResponse(req, `Invalid consent type: ${ct}`);
      if (history) {
        let q = supabase
          .from('user_consents')
          .select('id, consent_type, status, policy_version, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (ct) q = q.eq('consent_type', ct);
        const { data, error } = await q;
        if (error) {
          logger.error('Consent history error', { errorMessage: error.message });
          return internalErrorResponse(req);
        }
        return appendRateLimitHeaders(
          jsonResponse(req, { consents: data ?? [], count: data?.length ?? 0 }),
          rl,
          rlCfg,
        );
      }
      const { data, error } = await supabase.rpc('get_user_consent_status', {
        p_user_id: user.id,
        p_consent_type: ct ?? null,
      });
      if (error) {
        logger.error('Consent status error', { errorMessage: error.message });
        return internalErrorResponse(req);
      }
      return appendRateLimitHeaders(jsonResponse(req, { consents: data ?? [] }), rl, rlCfg);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON body');
    }
    const { consent_type, status, policy_version, metadata } = body;
    if (!consent_type || typeof consent_type !== 'string')
      return errorResponse(req, 'consent_type is required');
    if (!VALID_CONSENT_TYPES.has(consent_type))
      return errorResponse(
        req,
        `Invalid consent_type. Must be one of: ${[...VALID_CONSENT_TYPES].join(', ')}`,
      );
    if (!status || typeof status !== 'string')
      return errorResponse(req, 'status is required (granted or withdrawn)');
    if (!VALID_STATUSES.has(status))
      return errorResponse(req, 'status must be "granted" or "withdrawn"');
    if (!policy_version || typeof policy_version !== 'string')
      return errorResponse(req, 'policy_version is required (semver format, e.g. "1.0.0")');
    if (!SEMVER_RE.test(policy_version as string))
      return errorResponse(req, 'policy_version must be in semver format (e.g. "1.0.0")');
    if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null))
      return errorResponse(req, 'metadata must be a JSON object if provided');

    const { data: consent, error: insertErr } = await supabase
      .from('user_consents')
      .insert({
        user_id: user.id,
        consent_type,
        status,
        policy_version,
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent')?.substring(0, 512) ?? null,
        metadata: metadata ?? {},
      })
      .select('id, consent_type, status, policy_version, created_at')
      .single();
    if (insertErr) {
      logger.error('Consent insert error', { errorMessage: insertErr.message });
      return internalErrorResponse(req);
    }
    logger.info('Consent recorded', {
      httpStatus: 201,
      consentType: consent_type as string,
      consentStatus: status as string,
    });
    return appendRateLimitHeaders(
      jsonResponse(
        req,
        {
          consent,
          message: `Consent ${status === 'granted' ? 'granted' : 'withdrawn'} successfully`,
        },
        201,
      ),
      rl,
      rlCfg,
    );
  } catch (err) {
    logger.error('consent-management error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
