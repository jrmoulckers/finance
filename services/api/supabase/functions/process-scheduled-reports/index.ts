// SPDX-License-Identifier: BUSL-1.1

/**
 * Process Scheduled Reports Edge Function (#2626, follow-up to #2253).
 *
 * Server-side scheduler + email delivery for scheduled reports. Designed to be
 * invoked by a cron scheduler (pg_cron, external cron, or manual invocation for
 * testing), mirroring the process-recurring function.
 *
 * Responsibilities (the deferred backend work from #2626):
 *   - Find schedules that are due (next_run_at <= now, active, not paused).
 *   - Render a concise HTML summary email per due schedule WITHOUT leaking
 *     sensitive report data in URLs (the summary is rendered inline; no signed
 *     data is placed in query strings).
 *   - Deliver via the shared SMTP relay abstraction (_shared/notification.ts).
 *   - Record a delivery attempt per run (retry/failure tracking + observability).
 *   - Advance next_run_at from the cron expression on success, or schedule a
 *     bounded exponential-backoff retry (via next_run_at) on failure.
 *
 * Graceful degradation:
 *   When SMTP is not configured (SMTP_HOST unset), delivery is recorded as
 *   `skipped_no_smtp` instead of failing — the scheduling/persistence path is
 *   still exercised. Enabling real delivery requires SMTP credentials, which
 *   are human-held (see `## Needs Human Action` in the PR and
 *   services/api/docs/scheduled-reports.md).
 *
 * Authentication: CRON_SECRET header (shared secret), NOT user JWT.
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL (set automatically by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (set automatically by Supabase)
 *   CRON_SECRET               — Shared secret for authenticating cron requests
 *   SMTP_HOST / SMTP_PORT / SMTP_FROM — (Optional) email relay; when unset,
 *                               delivery is recorded as skipped_no_smtp.
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
import { sendEmail } from '../_shared/notification.ts';
import { computeNextRunAt, nextRetryAt } from '../_shared/scheduled-report-schedule.ts';

/** Maximum schedules processed per invocation (bounds work per cron tick). */
const MAX_BATCH = 50;

interface DueSchedule {
  id: string;
  household_id: string;
  report_config_id: string;
  cron_expression: string;
  recipients: string[] | null;
  retry_count: number;
  max_retries: number;
  report_configs?: { name?: string | null } | null;
}

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
    logger.error('Cron credential environment variable is not configured');
    return internalErrorResponse(req);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !(await timingSafeEqual(authHeader, `Bearer ${cronSecret}`))) {
    logger.warn('Unauthorized request — invalid or missing cron credential', {
      httpStatus: 401,
    });
    return errorResponse(req, 'Unauthorized', 401);
  }

  return null;
}

/**
 * Create a Supabase client with service role credentials.
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
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { client };
}

/**
 * Render a concise HTML + text summary for a scheduled report. The report name
 * is the only user data included; no signed URLs or sensitive figures are
 * embedded (#2626 acceptance: "without leaking sensitive data in URLs").
 */
function renderScheduleEmail(reportName: string): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const safeName = reportName.replace(/[<>&"']/g, '');
  const subject = `Your scheduled report: ${safeName}`;
  const textBody = `Your scheduled report "${safeName}" is ready. Open the Finance app to view the full report and download the CSV export.`;
  const htmlBody = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Scheduled report</title></head>',
    '<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">',
    `<h2 style="color: #1a1a2e;">${subject}</h2>`,
    `<p style="color: #333; line-height: 1.6;">${textBody}</p>`,
    '<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">',
    '<p style="color: #999; font-size: 12px;">Automated message from Finance. Manage or unsubscribe from scheduled reports in the app.</p>',
    '</body>',
    '</html>',
  ].join('\n');
  return { subject, htmlBody, textBody };
}

/**
 * Deliver a single due schedule, then record the attempt and advance the
 * schedule cursor. On failure, backoff is applied by moving next_run_at forward
 * to next_retry_at so the due query naturally respects the retry delay.
 */
async function processSchedule(
  supabase: ReturnType<typeof createClient>,
  schedule: DueSchedule,
  now: Date,
  logger: ReturnType<typeof createLogger>,
): Promise<{ id: string; status: string }> {
  const recipients = schedule.recipients ?? [];
  const reportName = schedule.report_configs?.name ?? 'Report';
  const smtpConfigured = Boolean(Deno.env.get('SMTP_HOST'));

  let status: 'delivered' | 'skipped_no_smtp' | 'failed' = 'failed';
  let errorMessage: string | null = null;

  try {
    if (recipients.length === 0) {
      // Export-only schedule — nothing to deliver, treat as a delivered no-op.
      status = 'delivered';
    } else if (!smtpConfigured) {
      status = 'skipped_no_smtp';
    } else {
      const template = renderScheduleEmail(reportName);
      const results = await Promise.all(recipients.map((to) => sendEmail(to, template, logger)));
      if (results.every(Boolean)) {
        status = 'delivered';
      } else {
        // status stays 'failed'.
        errorMessage = 'smtp_delivery_failed';
      }
    }
  } catch (err) {
    // status stays 'failed'.
    errorMessage = err instanceof Error ? err.constructor.name : 'unknown_error';
  }

  await supabase.from('scheduled_report_deliveries').insert({
    scheduled_report_id: schedule.id,
    household_id: schedule.household_id,
    status,
    attempt: schedule.retry_count + 1,
    recipient_count: recipients.length,
    error_message: errorMessage,
    rendered_at: now.toISOString(),
    delivered_at: status === 'delivered' ? now.toISOString() : null,
  });

  const nextRun = computeNextRunAt(schedule.cron_expression, now);

  if (status === 'failed') {
    const retry = nextRetryAt(schedule.retry_count, schedule.max_retries, now);
    await supabase
      .from('scheduled_reports')
      .update({
        last_run_at: now.toISOString(),
        last_run_status: 'failure',
        retry_count: schedule.retry_count + 1,
        next_retry_at: retry ? retry.toISOString() : null,
        // Retry: re-arm next_run_at at the backoff time. Exhausted: skip to the
        // next scheduled run so it never gets stuck retrying forever.
        next_run_at: retry ? retry.toISOString() : (nextRun?.toISOString() ?? null),
      })
      .eq('id', schedule.id);
    return { id: schedule.id, status };
  }

  // Delivered or skipped_no_smtp — advance to the next scheduled run.
  await supabase
    .from('scheduled_reports')
    .update({
      last_run_at: now.toISOString(),
      last_run_status: status === 'delivered' ? 'success' : 'failure',
      next_run_at: nextRun ? nextRun.toISOString() : null,
      next_retry_at: null,
      retry_count: 0,
    })
    .eq('id', schedule.id);

  return { id: schedule.id, status };
}

/**
 * Handle POST — process all due scheduled reports.
 */
async function handleProcessRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>,
): Promise<Response> {
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { data, error } = await supabase
      .from('scheduled_reports')
      .select(
        'id, household_id, report_config_id, cron_expression, recipients, retry_count, max_retries, report_configs(name)',
      )
      .is('deleted_at', null)
      .eq('is_active', true)
      .eq('is_paused', false)
      .lte('next_run_at', nowIso)
      .order('next_run_at', { ascending: true })
      .limit(MAX_BATCH);

    if (error) {
      logger.error('Failed to query due scheduled reports', {
        errorCode: error.code,
        errorMessage: error.message,
        httpStatus: 500,
      });
      return internalErrorResponse(req);
    }

    const due = (data ?? []) as unknown as DueSchedule[];

    const outcomes: Array<{ id: string; status: string }> = [];
    for (const schedule of due) {
      outcomes.push(await processSchedule(supabase, schedule, now, logger));
    }

    const summary = outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});

    logger.info('Scheduled reports processed', {
      processed: outcomes.length,
      httpStatus: 200,
    });

    return jsonResponse(req, {
      ok: true,
      processed_count: outcomes.length,
      summary,
      processed_at: nowIso,
    });
  } catch (err) {
    logger.error('Unexpected error processing scheduled reports', {
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
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('process-scheduled-reports');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('process-scheduled-reports', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return methodNotAllowedResponse(req);
  }

  const authError = await authenticateCron(req, logger);
  if (authError) return authError;

  const { client: supabase, error: clientError } = createServiceClient(req, logger);
  if (clientError) return clientError;

  try {
    const clientIp = getClientIp(req) ?? 'cron';
    const rateLimitResult = await checkRateLimit(
      supabase,
      clientIp,
      RATE_LIMITS['process-scheduled-reports'],
    );
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['process-scheduled-reports']);
    }
  } catch {
    // Rate limiting failure must not block cron processing — fail open.
  }

  return handleProcessRequest(req, supabase, logger);
});
