// SPDX-License-Identifier: BUSL-1.1

/**
 * Check Notifications Edge Function (#1051)
 *
 * Dual-purpose endpoint:
 *
 *   POST (cron): Runs all notification trigger detection functions:
 *     - Budget threshold checks (80% warning, 100% exceeded)
 *     - Goal milestone detection (25%, 50%, 75%, 100%)
 *     - Unusual spending detection (2x weekly average)
 *     Authenticated via CRON_SECRET (server-to-server).
 *
 *   GET (user): Returns the authenticated user's notifications with
 *     pagination, filtering by type and read status.
 *
 *   PATCH (user): Mark notifications as read.
 *
 * Security:
 *   - POST: CRON_SECRET authentication (no user JWT)
 *   - GET/PATCH: Requires user JWT authentication
 *   - All detection functions run as SECURITY DEFINER (service_role)
 *   - Notifications are household-scoped with RLS
 *   - NEVER return raw financial amounts in responses
 *   - Rate limited per function
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   CRON_SECRET               — Shared secret for cron authentication
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
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
  internalErrorResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_NOTIFICATION_TYPES = [
  'budget_warning',
  'budget_exceeded',
  'goal_milestone',
  'goal_completed',
  'unusual_spending',
  'system',
] as const;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// POST handler: Run all trigger detection (cron)
// ---------------------------------------------------------------------------

async function handleCronTrigger(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>,
): Promise<Response> {
  const results: Record<string, unknown> = {};

  // Run budget threshold detection
  try {
    const { data, error } = await supabase.rpc('detect_budget_threshold_notifications');
    if (error) {
      logger.error('Budget threshold detection failed', { errorMessage: error.message });
      results.budget_thresholds = { error: 'detection_failed' };
    } else {
      results.budget_thresholds = data;
    }
  } catch (err) {
    logger.error('Budget threshold detection error', {
      errorType: (err as Error).name,
    });
    results.budget_thresholds = { error: 'unexpected_error' };
  }

  // Run goal milestone detection
  try {
    const { data, error } = await supabase.rpc('detect_goal_milestone_notifications');
    if (error) {
      logger.error('Goal milestone detection failed', { errorMessage: error.message });
      results.goal_milestones = { error: 'detection_failed' };
    } else {
      results.goal_milestones = data;
    }
  } catch (err) {
    logger.error('Goal milestone detection error', {
      errorType: (err as Error).name,
    });
    results.goal_milestones = { error: 'unexpected_error' };
  }

  // Run unusual spending detection
  try {
    const { data, error } = await supabase.rpc('detect_unusual_spending');
    if (error) {
      logger.error('Unusual spending detection failed', { errorMessage: error.message });
      results.unusual_spending = { error: 'detection_failed' };
    } else {
      results.unusual_spending = data;
    }
  } catch (err) {
    logger.error('Unusual spending detection error', {
      errorType: (err as Error).name,
    });
    results.unusual_spending = { error: 'unexpected_error' };
  }

  logger.info('Notification trigger detection completed', {
    httpStatus: 200,
    results: JSON.stringify(results),
  });

  return jsonResponse(req, {
    ok: true,
    detection_results: results,
    completed_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// GET handler: Fetch user's notifications
// ---------------------------------------------------------------------------

async function handleGetNotifications(
  req: Request,
  userId: string,
  supabase: ReturnType<typeof createAdminClient>,
  logger: ReturnType<typeof createLogger>,
): Promise<Response> {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      parseInt(url.searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10) ||
        DEFAULT_PAGE_SIZE,
    ),
  );
  const typeFilter = url.searchParams.get('type');
  const unreadOnly = url.searchParams.get('unread') === 'true';

  // Validate type filter if provided
  if (typeFilter && !(VALID_NOTIFICATION_TYPES as readonly string[]).includes(typeFilter)) {
    return errorResponse(
      req,
      `Invalid type filter. Must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}`,
      400,
    );
  }

  // Build query
  let query = supabase
    .from('notifications')
    .select('id, type, title, message, metadata, is_read, read_at, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (typeFilter) {
    query = query.eq('type', typeFilter);
  }

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const offset = (page - 1) * pageSize;
  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to fetch notifications', { errorMessage: error.message });
    return internalErrorResponse(req);
  }

  // Also get unread count
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('deleted_at', null);

  const total = count ?? 0;

  logger.info('Notifications fetched', {
    httpStatus: 200,
    totalNotifications: total,
    unreadCount: unreadCount ?? 0,
    page,
  });

  return jsonResponse(req, {
    notifications: data ?? [],
    unread_count: unreadCount ?? 0,
    pagination: {
      page,
      page_size: pageSize,
      total,
      has_more: offset + pageSize < total,
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH handler: Mark notifications as read
// ---------------------------------------------------------------------------

async function handleMarkRead(
  req: Request,
  userId: string,
  supabase: ReturnType<typeof createAdminClient>,
  logger: ReturnType<typeof createLogger>,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, 'Invalid JSON body', 400);
  }

  const { notification_ids, mark_all_read } = body as {
    notification_ids?: string[];
    mark_all_read?: boolean;
  };

  if (
    !mark_all_read &&
    (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0)
  ) {
    return errorResponse(req, 'Provide notification_ids array or set mark_all_read to true', 400);
  }

  if (notification_ids && notification_ids.length > 100) {
    return errorResponse(req, 'Cannot mark more than 100 notifications at once', 400);
  }

  let query = supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('deleted_at', null);

  if (!mark_all_read && notification_ids) {
    query = query.in('id', notification_ids);
  }

  const { error } = await (query as unknown as PromiseLike<{ error: { message: string } | null }>);

  if (error) {
    logger.error('Failed to mark notifications as read', { errorMessage: error.message });
    return internalErrorResponse(req);
  }

  logger.info('Notifications marked as read', {
    httpStatus: 200,
    markAllRead: !!mark_all_read,
    count: notification_ids?.length ?? 'all',
  });

  return jsonResponse(req, {
    ok: true,
    marked_read: mark_all_read ? 'all' : (notification_ids?.length ?? 0),
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('check-notifications');
  logger.info('Request received', { method: req.method });

  // Validate environment
  const envError = validateEnv('process-recurring', req);
  if (envError) return envError;

  if (!['POST', 'GET', 'PATCH'].includes(req.method)) {
    return methodNotAllowedResponse(req);
  }

  try {
    // POST: Cron trigger (CRON_SECRET auth)
    if (req.method === 'POST') {
      const cronSecret = Deno.env.get('CRON_SECRET');
      if (!cronSecret) {
        logger.error('CRON_SECRET not configured');
        return internalErrorResponse(req);
      }

      const authHeader = req.headers.get('Authorization');
      if (!authHeader || !(await timingSafeEqual(authHeader, `Bearer ${cronSecret}`))) {
        logger.warn('Unauthorized cron request', { httpStatus: 401 });
        return errorResponse(req, 'Unauthorized', 401);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceRoleKey) {
        return internalErrorResponse(req);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Rate limit cron requests
      try {
        const clientIp = getClientIp(req) ?? 'cron';
        const rl = await checkRateLimit(supabase, clientIp, RATE_LIMITS['process-recurring']);
        if (!rl.allowed) {
          return rateLimitResponse(req, rl, RATE_LIMITS['process-recurring']);
        }
      } catch {
        // Fail open
      }

      return handleCronTrigger(req, supabase, logger);
    }

    // GET / PATCH: User authentication required
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    // Rate limiting for user requests
    const rl = await checkRateLimit(supabase, user.id, RATE_LIMITS['send-notification']);
    if (!rl.allowed) {
      return rateLimitResponse(req, rl, RATE_LIMITS['send-notification']);
    }

    if (req.method === 'GET') {
      return handleGetNotifications(req, user.id, supabase, logger);
    }

    // PATCH
    return handleMarkRead(req, user.id, supabase, logger);
  } catch (err) {
    logger.error('Check notifications error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
