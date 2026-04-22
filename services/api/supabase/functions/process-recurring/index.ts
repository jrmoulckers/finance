// SPDX-License-Identifier: BUSL-1.1

/**
 * Process Recurring Transactions Edge Function (#612, #1047)
 *
 * Generates transaction instances from recurring templates that are due.
 * Designed to be called by a cron scheduler (pg_cron, external cron, or
 * manual invocation for testing).
 *
 * Authentication: CRON_SECRET header (shared secret), NOT user JWT.
 * This is a server-to-server endpoint — no end-user should call it directly.
 *
 * Features:
 *   - POST: Generate recurring transactions for a given date
 *   - Idempotent: skips templates already generated for the current period (#1047)
 *   - Returns both generated_count and skipped_count for observability
 *   - GET with ?action=status: Returns recurring template status (monitoring)
 *   - Rate limited via shared checkRateLimit() for defence in depth (#272)
 *
 * Cron Integration:
 *   Configure pg_cron or an external scheduler to POST daily:
 *   ```
 *   SELECT cron.schedule('process-recurring', '0 2 * * *',
 *     $$SELECT net.http_post(
 *       url := '<SUPABASE_URL>/functions/v1/process-recurring',
 *       headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
 *     )$$
 *   );
 *   ```
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL (set automatically by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (set automatically by Supabase)
 *   CRON_SECRET               — Shared secret for authenticating cron requests
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { createLogger } from '../_shared/logger.ts';
import { validateEnv } from '../_shared/env.ts';
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from '../_shared/rate-limit.ts';
import {
  errorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  internalErrorResponse,
} from '../_shared/response.ts';

/** ISO 8601 date pattern: YYYY-MM-DD */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Authenticate the request via CRON_SECRET header.
 * Returns null if authenticated, or an error Response.
 */
async function authenticateCron(
  req: Request,
  logger: ReturnType<typeof createLogger>,
): Promise<Response | null> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    logger.error('CRON_SECRET environment variable is not configured');
    return internalErrorResponse(req);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !(await timingSafeEqual(authHeader, `Bearer ${cronSecret}`))) {
    logger.warn('Unauthorized request — invalid or missing CRON_SECRET', {
      httpStatus: 401,
    });
    return errorResponse(req, 'Unauthorized', 401);
  }

  return null;
}

/**
 * Create a Supabase client with service role credentials.
 * Returns null + error Response if env vars are missing.
 */
function createServiceClient(
  req: Request,
  logger: ReturnType<typeof createLogger>,
):
  | { client: ReturnType<typeof createClient>; error?: undefined }
  | { client?: undefined; error: Response } {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    logger.error('Missing required Supabase environment variables');
    return { error: internalErrorResponse(req) };
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return { client };
}

/**
 * Handle GET ?action=status — return recurring template monitoring data.
 */
async function handleStatusRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>,
): Promise<Response> {
  try {
    const { data, error } = await supabase.rpc('get_recurring_status');

    if (error) {
      logger.error('get_recurring_status RPC failed', {
        errorCode: error.code,
        errorMessage: error.message,
        httpStatus: 500,
      });
      return internalErrorResponse(req);
    }

    logger.info('Recurring status retrieved', { httpStatus: 200 });

    return jsonResponse(req, {
      ok: true,
      status: data,
    });
  } catch (err) {
    logger.error('Unexpected error fetching recurring status', {
      errorType: err instanceof Error ? err.constructor.name : 'Unknown',
      httpStatus: 500,
    });
    return internalErrorResponse(req);
  }
}

/**
 * Handle POST — process recurring transactions with idempotency.
 */
async function handleProcessRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>,
): Promise<Response> {
  // ---------------------------------------------------------------------------
  // Parse optional as_of_date from request body
  // ---------------------------------------------------------------------------
  let asOfDate: string | undefined;

  try {
    const contentType = req.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.as_of_date !== undefined) {
        if (typeof body.as_of_date !== 'string' || !ISO_DATE_PATTERN.test(body.as_of_date)) {
          logger.warn('Invalid as_of_date format', { httpStatus: 400 });
          return errorResponse(
            req,
            'Invalid as_of_date format. Expected ISO 8601 date: YYYY-MM-DD.',
            400,
          );
        }
        asOfDate = body.as_of_date;
      }
    }
  } catch {
    logger.warn('Failed to parse request body', { httpStatus: 400 });
    return errorResponse(req, 'Invalid JSON in request body.', 400);
  }

  // ---------------------------------------------------------------------------
  // Call the idempotent database function via service_role client
  // ---------------------------------------------------------------------------
  try {
    const rpcArgs: Record<string, string> = {};
    if (asOfDate) {
      rpcArgs.p_as_of_date = asOfDate;
    }

    const { data, error } = await supabase.rpc('generate_recurring_transactions', rpcArgs);

    if (error) {
      logger.error('RPC call failed', {
        errorCode: error.code,
        errorMessage: error.message,
        httpStatus: 500,
      });
      return internalErrorResponse(req);
    }

    // data is the JSONB result from the idempotent PL/pgSQL function
    const result = data as {
      generated_count: number;
      skipped_count: number;
      batch_id: string;
      as_of_date: string;
      generated_at: string;
    };

    logger.info('Recurring transactions processed', {
      generatedCount: result.generated_count,
      skippedCount: result.skipped_count,
      batchId: result.batch_id,
      asOfDate: result.as_of_date,
      httpStatus: 200,
    });

    return jsonResponse(req, {
      ok: true,
      generated_count: result.generated_count,
      skipped_count: result.skipped_count,
      batch_id: result.batch_id,
      as_of_date: result.as_of_date,
      generated_at: result.generated_at,
      idempotent: result.skipped_count > 0,
    });
  } catch (err) {
    logger.error('Unexpected error during recurring transaction processing', {
      errorType: err instanceof Error ? err.constructor.name : 'Unknown',
      httpStatus: 500,
    });
    return internalErrorResponse(req);
  }
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('process-recurring');
  logger.info('Request received', { method: req.method });

  // Validate required environment variables (#616)
  const envError = validateEnv('process-recurring', req);
  if (envError) return envError;

  // Only accept POST and GET
  if (req.method !== 'POST' && req.method !== 'GET') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return methodNotAllowedResponse(req);
  }

  // ---------------------------------------------------------------------------
  // Authenticate via CRON_SECRET header (all methods)
  // ---------------------------------------------------------------------------
  const authError = await authenticateCron(req, logger);
  if (authError) return authError;

  // ---------------------------------------------------------------------------
  // Create service client
  // ---------------------------------------------------------------------------
  const { client: supabase, error: clientError } = createServiceClient(req, logger);
  if (clientError) return clientError;

  // ---------------------------------------------------------------------------
  // Rate limiting (IP-based, defence in depth, #272)
  // ---------------------------------------------------------------------------
  try {
    const clientIp = getClientIp(req) ?? 'cron';
    const rateLimitResult = await checkRateLimit(
      supabase,
      clientIp,
      RATE_LIMITS['process-recurring'],
    );
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['process-recurring']);
    }
  } catch {
    // Rate limiting failure must not block cron processing — fail open
  }

  // ---------------------------------------------------------------------------
  // Route by method
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'status') {
      return handleStatusRequest(req, supabase, logger);
    }

    return errorResponse(req, 'Invalid action. Use ?action=status for monitoring.', 400);
  }

  // POST — process recurring transactions
  return handleProcessRequest(req, supabase, logger);
});
