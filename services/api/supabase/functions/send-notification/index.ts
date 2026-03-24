// SPDX-License-Identifier: BUSL-1.1

/**
 * Send Notification Edge Function (#685)
 *
 * Creates a notification record and attempts email delivery.
 *
 * Methods:
 *   POST — Create and send a notification
 *
 * Security:
 *   - Requires authentication (Bearer JWT)
 *   - Rate-limited: 30 requests/minute per user
 *   - Users can only send notifications to themselves (unless service role)
 *   - All operations use the admin client (service_role) for DB writes
 *     since notification_log INSERT is restricted to service role via RLS
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 *   SMTP_HOST                 — (Optional) SMTP relay hostname
 *   SMTP_PORT                 — (Optional) SMTP relay port
 *   SMTP_FROM                 — (Optional) Sender email address
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  createNotification,
  renderEmailTemplate,
  sendEmail,
  type NotificationType,
} from '../_shared/notification.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
  createdResponse,
  errorResponse,
  internalErrorResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

/** Valid notification types (mirrors the CHECK constraint in the DB). */
const VALID_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'invite_received',
  'invite_accepted',
  'export_ready',
  'deletion_scheduled',
  'deletion_completed',
  'security_alert',
]);

serve(async (req: Request): Promise<Response> => {
  // -------------------------------------------------------------------------
  // CORS preflight
  // -------------------------------------------------------------------------
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('send-notification');
  logger.info('Request received', { method: req.method });

  try {
    // -----------------------------------------------------------------------
    // Environment validation
    // -----------------------------------------------------------------------
    const envError = validateEnv('send-notification', req);
    if (envError) {
      return envError;
    }

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

    // -----------------------------------------------------------------------
    // Admin client (service_role — required for notification_log INSERT)
    // -----------------------------------------------------------------------
    const supabase = createAdminClient();

    // -----------------------------------------------------------------------
    // Rate limiting (user-based, 30 req/min)
    // -----------------------------------------------------------------------
    const rateLimitResult = await checkRateLimit(
      supabase,
      user.id,
      RATE_LIMITS['send-notification'],
    );
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['send-notification']);
    }

    // -----------------------------------------------------------------------
    // POST only
    // -----------------------------------------------------------------------
    if (req.method !== 'POST') {
      return methodNotAllowedResponse(req);
    }

    // -----------------------------------------------------------------------
    // Parse and validate request body
    // -----------------------------------------------------------------------
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON body');
    }

    const {
      type,
      user_id: targetUserId,
      subject: customSubject,
      body: customBody,
      metadata,
    } = body as {
      type?: string;
      user_id?: string;
      subject?: string;
      body?: string;
      metadata?: Record<string, unknown>;
    };

    // Validate notification type
    if (!type) {
      return errorResponse(req, 'type is required');
    }
    if (!VALID_NOTIFICATION_TYPES.has(type)) {
      return errorResponse(req, `Invalid notification type: ${type}`);
    }

    // Resolve target user — defaults to the authenticated user
    const resolvedUserId = targetUserId ?? user.id;

    // Users can only send notifications to themselves
    if (resolvedUserId !== user.id) {
      logger.warn('Attempted cross-user notification', { httpStatus: 403 });
      return errorResponse(req, 'Cannot send notifications to other users', 403);
    }

    const notificationType = type as NotificationType;

    // Generate subject/body from template if not provided
    const template = renderEmailTemplate(
      notificationType,
      (metadata ?? {}) as Record<string, string>,
    );
    const finalSubject = customSubject ?? template.subject;
    const finalBody = customBody ?? template.textBody;

    // -----------------------------------------------------------------------
    // Create notification record (checks preferences internally)
    // -----------------------------------------------------------------------
    const notification = await createNotification(supabase, {
      userId: resolvedUserId,
      type: notificationType,
      subject: finalSubject,
      body: finalBody,
      channel: 'email',
      metadata: metadata ?? {},
    });

    if (!notification) {
      // Notification was either skipped (preferences) or failed to insert.
      // This is not an error from the client's perspective.
      logger.info('Notification skipped or preference disabled', {
        notificationType: type,
        httpStatus: 201,
      });
      return createdResponse(req, {
        notification_id: null,
        status: 'skipped',
        message: 'Notification skipped (disabled by user preference or insert failed)',
      });
    }

    // -----------------------------------------------------------------------
    // Attempt email delivery
    // -----------------------------------------------------------------------
    const emailSent = await sendEmail(user.email, template, logger);

    // Update notification status based on delivery result
    const finalStatus = emailSent ? 'sent' : 'failed';
    const updateData: Record<string, unknown> = { status: finalStatus };
    if (emailSent) {
      updateData.sent_at = new Date().toISOString();
    } else {
      updateData.error_message = 'Email delivery failed or SMTP not configured';
    }

    // Best-effort status update — don't fail the request if this fails
    try {
      await (supabase
        .from('notification_log')
        .update(updateData)
        .eq('id', notification.id) as PromiseLike<unknown>);
    } catch {
      logger.warn('Failed to update notification status', {
        notificationId: notification.id,
      });
    }

    logger.info('Notification created', {
      notificationId: notification.id,
      notificationType: type,
      emailSent,
      httpStatus: 201,
    });

    return createdResponse(req, {
      notification_id: notification.id,
      status: finalStatus,
      email_sent: emailSent,
    });
  } catch (err) {
    logger.error('Send notification error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
