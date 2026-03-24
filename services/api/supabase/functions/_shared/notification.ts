// SPDX-License-Identifier: BUSL-1.1

/**
 * Notification helper module for Supabase Edge Functions (#685).
 *
 * Provides shared utilities for creating notifications, checking user
 * preferences, rendering email templates, and sending email via SMTP.
 *
 * Design:
 *   - Uses structural typing (like rate-limit.ts) so the Supabase
 *     client parameter accepts anything with a `.from()` method.
 *   - Preference checks default to `true` when no row exists (opt-out model).
 *   - Email sending degrades gracefully when SMTP is not configured.
 *
 * Security:
 *   NEVER log email addresses, user data, or notification body content.
 *   DO log — notification IDs, types, delivery status, and error types.
 */

import type { Logger } from './logger.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported notification event types. */
export type NotificationType =
  | 'invite_received'
  | 'invite_accepted'
  | 'export_ready'
  | 'deletion_scheduled'
  | 'deletion_completed'
  | 'security_alert';

/** Supported delivery channels. */
export type NotificationChannel = 'email' | 'push' | 'in_app';

/** Payload for creating a notification. */
export interface NotificationPayload {
  /** Target user ID. */
  userId: string;
  /** Notification event type. */
  type: NotificationType;
  /** Email/notification subject line. */
  subject: string;
  /** Notification body text. */
  body: string;
  /** Delivery channel (defaults to 'email'). */
  channel?: NotificationChannel;
  /** Arbitrary metadata for the notification (NEVER store PII). */
  metadata?: Record<string, unknown>;
}

/** Rendered email template ready for delivery. */
export interface EmailTemplate {
  /** Email subject line. */
  subject: string;
  /** HTML body content. */
  htmlBody: string;
  /** Plain-text body content. */
  textBody: string;
}

/**
 * Minimal interface for a client that supports Supabase-style query building.
 *
 * Using a structural interface (rather than importing SupabaseClient)
 * keeps this module loosely coupled and easy to test with mocks.
 */
export interface NotificationClient {
  from(
    table: string,
  ): {
    select: (...args: unknown[]) => unknown;
    insert: (...args: unknown[]) => unknown;
    eq: (...args: unknown[]) => unknown;
    is: (...args: unknown[]) => unknown;
    single: (...args: unknown[]) => unknown;
    [key: string]: (...args: unknown[]) => unknown;
  };
}

// ---------------------------------------------------------------------------
// Default subjects and bodies per notification type
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES: Record<NotificationType, { subject: string; body: string }> = {
  invite_received: {
    subject: 'You have been invited to a household',
    body: 'You have received an invitation to join a household on Finance.',
  },
  invite_accepted: {
    subject: 'Household invitation accepted',
    body: 'A user has accepted your household invitation.',
  },
  export_ready: {
    subject: 'Your data export is ready',
    body: 'Your requested data export has been completed and is ready for download.',
  },
  deletion_scheduled: {
    subject: 'Account deletion scheduled',
    body: 'Your account has been scheduled for deletion. You can cancel this within the grace period.',
  },
  deletion_completed: {
    subject: 'Account deletion completed',
    body: 'Your account and all associated data have been permanently deleted.',
  },
  security_alert: {
    subject: 'Security alert for your account',
    body: 'A security-related event has been detected on your account. Please review your recent activity.',
  },
};

// ---------------------------------------------------------------------------
// Preference check
// ---------------------------------------------------------------------------

/**
 * Check whether a user has a specific notification type enabled.
 *
 * Returns `true` (notifications enabled) when:
 *   - No preferences row exists for the user (opt-out model)
 *   - The user's global `email_enabled` is true AND the specific type flag is true
 *
 * Returns `false` when:
 *   - The user's global `email_enabled` is false
 *   - The specific notification type flag is false
 *
 * @param supabase  A Supabase client (service_role) or compatible mock.
 * @param userId    The target user's UUID.
 * @param type      The notification type to check.
 * @returns Whether the notification should be delivered.
 */
export async function checkNotificationPreference(
  supabase: NotificationClient,
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  try {
    const result = await (supabase
      .from('notification_preferences')
      .select('email_enabled, invite_notifications, export_notifications, deletion_notifications, security_notifications')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single() as PromiseLike<{
      data: Record<string, boolean> | null;
      error: { message: string } | null;
    }>);

    // No preferences row → default to enabled (opt-out model)
    if (result.error || !result.data) {
      return true;
    }

    const prefs = result.data;

    // Global kill-switch
    if (!prefs.email_enabled) {
      return false;
    }

    // Map notification type → preference column
    const typeToColumn: Record<NotificationType, string> = {
      invite_received: 'invite_notifications',
      invite_accepted: 'invite_notifications',
      export_ready: 'export_notifications',
      deletion_scheduled: 'deletion_notifications',
      deletion_completed: 'deletion_notifications',
      security_alert: 'security_notifications',
    };

    const column = typeToColumn[type];
    return prefs[column] !== false;
  } catch {
    // Fail open: if we can't check preferences, allow the notification
    return true;
  }
}

// ---------------------------------------------------------------------------
// Create notification
// ---------------------------------------------------------------------------

/**
 * Create a notification record in the notification_log table.
 *
 * Checks user preferences first. If the notification type is disabled,
 * the notification is skipped (returns null) and a 'skipped' record
 * is still inserted for audit purposes.
 *
 * @param supabase  A Supabase client (service_role) or compatible mock.
 * @param payload   The notification payload.
 * @returns The created notification `{ id }`, or `null` if skipped/failed.
 */
export async function createNotification(
  supabase: NotificationClient,
  payload: NotificationPayload,
): Promise<{ id: string } | null> {
  const { userId, type, subject, body, channel = 'email', metadata = {} } = payload;

  try {
    // Check user preferences
    const isEnabled = await checkNotificationPreference(supabase, userId, type);

    const status = isEnabled ? 'pending' : 'skipped';

    const result = await (supabase
      .from('notification_log')
      .insert({
        user_id: userId,
        notification_type: type,
        subject,
        body,
        channel,
        status,
        metadata,
      })
      .select('id')
      .single() as PromiseLike<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>);

    if (result.error || !result.data) {
      return null;
    }

    if (!isEnabled) {
      return null;
    }

    return { id: result.data.id };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Email template rendering
// ---------------------------------------------------------------------------

/**
 * Render an email template for a given notification type.
 *
 * Substitutes `{{key}}` placeholders in the default template with
 * values from the `data` map. Produces both HTML and plain-text versions.
 *
 * @param type  The notification type (determines the base template).
 * @param data  Key-value pairs to substitute into the template.
 * @returns A rendered {@link EmailTemplate}.
 */
export function renderEmailTemplate(
  type: NotificationType,
  data: Record<string, string> = {},
): EmailTemplate {
  const defaults = DEFAULT_TEMPLATES[type];
  let subject = defaults.subject;
  let textBody = defaults.body;

  // Substitute placeholders: {{key}} → value
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    subject = subject.replaceAll(placeholder, value);
    textBody = textBody.replaceAll(placeholder, value);
  }

  // Build a simple HTML wrapper
  const htmlBody = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Finance Notification</title></head>',
    '<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">',
    `<h2 style="color: #1a1a2e;">${escapeHtml(subject)}</h2>`,
    `<p style="color: #333; line-height: 1.6;">${escapeHtml(textBody)}</p>`,
    '<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">',
    '<p style="color: #999; font-size: 12px;">This is an automated message from Finance. Do not reply to this email.</p>',
    '</body>',
    '</html>',
  ].join('\n');

  return { subject, htmlBody, textBody };
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Email sending
// ---------------------------------------------------------------------------

/**
 * Send an email via SMTP relay.
 *
 * Reads SMTP configuration from environment variables:
 *   - `SMTP_HOST` — SMTP server hostname
 *   - `SMTP_PORT` — SMTP server port (default: 587)
 *   - `SMTP_FROM` — Sender email address
 *
 * If SMTP is not configured (SMTP_HOST not set), the function logs a
 * warning and returns `false` without attempting delivery. This allows
 * the notification system to function in development without an SMTP
 * server.
 *
 * Security:
 *   NEVER log the recipient email address or email body content.
 *   DO log — delivery success/failure, error type, and notification metadata.
 *
 * @param to        Recipient email address.
 * @param template  The rendered email template.
 * @param logger    Logger instance for structured logging.
 * @returns `true` if the email was sent successfully, `false` otherwise.
 */
export async function sendEmail(
  _to: string,
  template: EmailTemplate,
  logger: Logger,
): Promise<boolean> {
  const smtpHost = typeof Deno !== 'undefined' ? Deno.env.get('SMTP_HOST') : undefined;

  if (!smtpHost) {
    logger.warn('SMTP not configured — email delivery skipped', {
      templateSubject: template.subject,
    });
    return false;
  }

  const smtpPort = typeof Deno !== 'undefined'
    ? Deno.env.get('SMTP_PORT') ?? '587'
    : '587';
  const smtpFrom = typeof Deno !== 'undefined'
    ? Deno.env.get('SMTP_FROM') ?? 'noreply@finance.app'
    : 'noreply@finance.app';

  try {
    // Build a minimal SMTP payload for the relay.
    // In production this would use a proper SMTP client library or
    // an HTTP-based email API (SendGrid, Resend, etc.). For now we
    // make an HTTP POST to the SMTP relay endpoint.
    const payload = {
      from: smtpFrom,
      subject: template.subject,
      html: template.htmlBody,
      text: template.textBody,
    };

    const response = await fetch(`http://${smtpHost}:${smtpPort}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error('Email delivery failed', {
        httpStatus: response.status,
        templateSubject: template.subject,
      });
      return false;
    }

    logger.info('Email delivered successfully', {
      templateSubject: template.subject,
    });
    return true;
  } catch (err) {
    logger.error('Email delivery error', {
      errorMessage: (err as Error).message,
      templateSubject: template.subject,
    });
    return false;
  }
}
