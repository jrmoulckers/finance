-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260324000001_notification_infrastructure
-- Description: Create notification preferences and notification log tables
-- Issues: #685
--
-- Adds two tables to support the notification and email infrastructure:
--   - notification_preferences: Per-user opt-in/opt-out for each notification type
--   - notification_log: Immutable log of all notifications sent or attempted
--
-- Security:
--   - RLS enabled on both tables (no exceptions)
--   - notification_preferences: users can only read/write their own preferences
--   - notification_log: users can read their own notifications; inserts are
--     restricted to the service role (Edge Functions) to prevent spoofing
--
-- Design:
--   - notification_preferences uses a UNIQUE(user_id, deleted_at) partial constraint
--     to allow one active preferences row per user while supporting soft deletes
--   - notification_log is append-only from the user's perspective (no UPDATE/DELETE)
--   - Indexes are tuned for the two primary query patterns:
--       1. Fetching a user's recent notifications (user_id + created_at DESC)
--       2. Processing pending notifications (status = 'pending')

-- =============================================================================
-- notification_preferences
-- =============================================================================
-- Per-user notification preferences. Each user has at most one active row.
-- If no row exists, all notifications default to enabled.

CREATE TABLE notification_preferences (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_enabled           BOOLEAN     NOT NULL DEFAULT true,
    invite_notifications    BOOLEAN     NOT NULL DEFAULT true,
    export_notifications    BOOLEAN     NOT NULL DEFAULT true,
    deletion_notifications  BOOLEAN     NOT NULL DEFAULT true,
    security_notifications  BOOLEAN     NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

-- Only one active preferences row per user (soft-delete aware).
CREATE UNIQUE INDEX idx_notification_preferences_user_active
    ON notification_preferences (user_id)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE notification_preferences IS
    'Per-user notification opt-in/opt-out settings. One active row per user; defaults to all enabled if absent.';
COMMENT ON COLUMN notification_preferences.user_id IS
    'References auth.users(id). Cascades on user deletion.';
COMMENT ON COLUMN notification_preferences.email_enabled IS
    'Global kill-switch for all email notifications.';
COMMENT ON COLUMN notification_preferences.invite_notifications IS
    'Whether to notify on household invitation events.';
COMMENT ON COLUMN notification_preferences.export_notifications IS
    'Whether to notify when a data export is ready.';
COMMENT ON COLUMN notification_preferences.deletion_notifications IS
    'Whether to notify on account deletion lifecycle events.';
COMMENT ON COLUMN notification_preferences.security_notifications IS
    'Whether to notify on security-related events (always recommended).';

-- =============================================================================
-- notification_log
-- =============================================================================
-- Immutable log of all notifications. Each row represents one notification
-- attempt (email, push, or in-app). Status tracks the delivery lifecycle.

CREATE TABLE notification_log (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type   TEXT        NOT NULL
        CHECK (notification_type IN (
            'invite_received',
            'invite_accepted',
            'export_ready',
            'deletion_scheduled',
            'deletion_completed',
            'security_alert'
        )),
    subject             TEXT        NOT NULL,
    body                TEXT        NOT NULL,
    channel             TEXT        NOT NULL DEFAULT 'email'
        CHECK (channel IN ('email', 'push', 'in_app')),
    status              TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    metadata            JSONB       DEFAULT '{}',
    error_message       TEXT,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: user's recent notifications (notification center / history).
CREATE INDEX idx_notification_log_user_created
    ON notification_log (user_id, created_at DESC);

-- Processing queue: find pending notifications for the delivery worker.
CREATE INDEX idx_notification_log_pending
    ON notification_log (status)
    WHERE status = 'pending';

COMMENT ON TABLE notification_log IS
    'Append-only log of all notification delivery attempts. Users can read their own; inserts via service role only.';
COMMENT ON COLUMN notification_log.notification_type IS
    'Enum: invite_received, invite_accepted, export_ready, deletion_scheduled, deletion_completed, security_alert.';
COMMENT ON COLUMN notification_log.channel IS
    'Delivery channel: email, push, or in_app.';
COMMENT ON COLUMN notification_log.status IS
    'Delivery status lifecycle: pending → sent | failed | skipped.';
COMMENT ON COLUMN notification_log.metadata IS
    'Arbitrary JSON payload for channel-specific data (e.g. message-id, template vars). NEVER store PII.';
COMMENT ON COLUMN notification_log.error_message IS
    'Operational error description on failure. NEVER contains user data.';
COMMENT ON COLUMN notification_log.sent_at IS
    'Timestamp when the notification was successfully delivered (null if pending/failed/skipped).';

-- =============================================================================
-- updated_at trigger for notification_preferences
-- =============================================================================
-- Reuses the existing public.set_updated_at() trigger function from
-- 20260306000001_initial_schema.sql.

CREATE TRIGGER trg_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Enable RLS on both tables
-- =============================================================================

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log         ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS policies: notification_preferences
-- =============================================================================
-- Users can read, create, and update their own preferences.

CREATE POLICY notification_preferences_select ON notification_preferences
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY notification_preferences_insert ON notification_preferences
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY notification_preferences_update ON notification_preferences
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- RLS policies: notification_log
-- =============================================================================
-- Users can read their own notifications.
-- Inserts are restricted — only the service role (which bypasses RLS) can
-- create notification log entries. This prevents users from spoofing
-- notifications. The INSERT policy below uses a false condition to block
-- all user-level inserts; Edge Functions use the service_role client.

CREATE POLICY notification_log_select ON notification_log
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY notification_log_insert ON notification_log
    FOR INSERT
    WITH CHECK (false);
