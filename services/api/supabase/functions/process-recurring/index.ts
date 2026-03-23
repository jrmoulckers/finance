// SPDX-License-Identifier: BUSL-1.1

/**
 * Process Recurring Transactions Edge Function (#612)
 *
 * Generates transaction instances from recurring templates that are due.
 * Designed to be called by a cron scheduler (pg_cron, external cron, or
 * manual invocation for testing).
 *
 * Authentication: CRON_SECRET header (shared secret), NOT user JWT.
 * This is a server-to-server endpoint — no end-user should call it directly.
 *
 * - POST only
 * - Accepts optional `as_of_date` in body (ISO 8601 date string, defaults to today)
 * - Calls `generate_recurring_transactions` RPC via service_role client
 * - Returns a summary: { generated_count, as_of_date, generated_at }
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL (set automatically by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (set automatically by Supabase)
 *   CRON_SECRET               — Shared secret for authenticating cron requests
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  errorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  internalErrorResponse,
} from '../_shared/response.ts';

/** ISO 8601 date pattern: YYYY-MM-DD */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('process-recurring');
  logger.info('Request received', { method: req.method });

  // Only accept POST
  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return methodNotAllowedResponse(req);
  }

  // ---------------------------------------------------------------------------
  // Authenticate via CRON_SECRET header
  // ---------------------------------------------------------------------------
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    logger.error('CRON_SECRET environment variable is not configured');
    return internalErrorResponse(req);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Unauthorized request — invalid or missing CRON_SECRET', {
      httpStatus: 401,
    });
    return errorResponse(req, 'Unauthorized', 401);
  }

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
  // Call the database function via service_role client
  // ---------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    logger.error('Missing required Supabase environment variables');
    return internalErrorResponse(req);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

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

    // data is the JSONB result from the PL/pgSQL function
    const result = data as { generated_count: number; as_of_date: string; generated_at: string };

    logger.info('Recurring transactions processed', {
      generatedCount: result.generated_count,
      asOfDate: result.as_of_date,
      httpStatus: 200,
    });

    return jsonResponse(req, {
      ok: true,
      generated_count: result.generated_count,
      as_of_date: result.as_of_date,
      generated_at: result.generated_at,
    });
  } catch (err) {
    logger.error('Unexpected error during recurring transaction processing', {
      errorType: err instanceof Error ? err.constructor.name : 'Unknown',
      httpStatus: 500,
    });
    return internalErrorResponse(req);
  }
});
