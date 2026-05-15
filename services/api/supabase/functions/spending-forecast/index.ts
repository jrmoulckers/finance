// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): SPECULATIVE — Not wired to any client. Has tests but depends
// on get_spending_forecast() and get_spending_summary() RPCs that may not
// exist yet. Post-alpha feature. Exclude from alpha deployment. (#1390)

/**
 * Spending Forecast Edge Function (#328)
 *
 * Provides spending predictions with confidence intervals based on
 * historical transaction data. Uses weighted moving averages computed
 * by the database-level get_spending_forecast() RPC.
 *
 * Endpoints:
 *   GET ?action=forecast   — Get spending forecast for a household
 *   GET ?action=summary    — Get historical spending summary
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Household membership required
 *   - NEVER returns raw transaction data — only statistical aggregates
 *   - Rate limited: 30 requests per user per minute
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
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FORECAST_MONTHS = 12;
const MAX_HISTORY_MONTHS = 24;
const MIN_HISTORY_MONTHS = 2;
const DEFAULT_FORECAST_MONTHS = 3;
const DEFAULT_HISTORY_MONTHS = 6;
const VALID_CONFIDENCE_LEVELS = [0.8, 0.9, 0.95, 0.99];

type ForecastAction = 'forecast' | 'summary';
const VALID_ACTIONS: readonly ForecastAction[] = ['forecast', 'summary'];

// ---------------------------------------------------------------------------
// Parameter parsing
// ---------------------------------------------------------------------------

interface ForecastParams {
  household_id: string;
  months_ahead: number;
  history_months: number;
  category_id: string | null;
  confidence_level: number;
}

function parseParams(url: URL): ForecastParams | string {
  const householdId = url.searchParams.get('household_id');
  if (!householdId) return 'household_id is required';

  const monthsAhead = parseInt(
    url.searchParams.get('months_ahead') ?? String(DEFAULT_FORECAST_MONTHS),
    10,
  );
  if (isNaN(monthsAhead) || monthsAhead < 1 || monthsAhead > MAX_FORECAST_MONTHS) {
    return `months_ahead must be between 1 and ${MAX_FORECAST_MONTHS}`;
  }

  const historyMonths = parseInt(
    url.searchParams.get('history_months') ?? String(DEFAULT_HISTORY_MONTHS),
    10,
  );
  if (
    isNaN(historyMonths) ||
    historyMonths < MIN_HISTORY_MONTHS ||
    historyMonths > MAX_HISTORY_MONTHS
  ) {
    return `history_months must be between ${MIN_HISTORY_MONTHS} and ${MAX_HISTORY_MONTHS}`;
  }

  const confidenceStr = url.searchParams.get('confidence_level');
  let confidenceLevel = 0.95;
  if (confidenceStr) {
    confidenceLevel = parseFloat(confidenceStr);
    if (!VALID_CONFIDENCE_LEVELS.includes(confidenceLevel)) {
      return `confidence_level must be one of: ${VALID_CONFIDENCE_LEVELS.join(', ')}`;
    }
  }

  return {
    household_id: householdId,
    months_ahead: monthsAhead,
    history_months: historyMonths,
    category_id: url.searchParams.get('category_id'),
    confidence_level: confidenceLevel,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('spending-forecast');
  logger.info('Request received', { method: req.method });

  if (req.method !== 'GET') {
    return methodNotAllowedResponse(req);
  }

  const envError = validateEnv('spending-forecast', req);
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
    const rateLimitResult = await checkRateLimit(
      supabase,
      user.id,
      RATE_LIMITS['spending-forecast'],
    );
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['spending-forecast']);
    }

    const url = new URL(req.url);
    const action = (url.searchParams.get('action') ?? 'forecast') as ForecastAction;

    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return errorResponse(req, `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400);
    }

    // Parse and validate parameters
    const paramsResult = parseParams(url);
    if (typeof paramsResult === 'string') {
      return errorResponse(req, paramsResult);
    }

    const params = paramsResult;

    // Verify household membership
    const { data: membership, error: memError } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', params.household_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (memError || !membership) {
      return errorResponse(req, 'Household access denied', 403);
    }

    if (action === 'summary') {
      // Return spending summary
      const { data, error } = await supabase.rpc('get_spending_summary', {
        p_household_id: params.household_id,
        p_months: params.history_months,
        p_category_id: params.category_id,
      });

      if (error) {
        logger.error('Failed to get spending summary', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      logger.info('Spending summary returned', { httpStatus: 200 });
      return jsonResponse(req, { summary: data ?? [] });
    }

    // action === 'forecast'
    const { data, error } = await supabase.rpc('get_spending_forecast', {
      p_household_id: params.household_id,
      p_months_ahead: params.months_ahead,
      p_history_months: params.history_months,
      p_category_id: params.category_id,
      p_confidence_level: params.confidence_level,
    });

    if (error) {
      logger.error('Failed to get spending forecast', { errorMessage: error.message });
      return internalErrorResponse(req);
    }

    logger.info('Spending forecast returned', {
      httpStatus: 200,
      forecastMonths: params.months_ahead,
      confidenceLevel: params.confidence_level,
    });

    return jsonResponse(req, { forecast: data });
  } catch (err) {
    logger.error('Spending forecast error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
