-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260324000001_notification_infrastructure
-- Description: Drop notification preferences and notification log tables
-- Issues: #893

-- =============================================================================
-- Drop notification_log
-- =============================================================================
DROP POLICY IF EXISTS notification_log_insert ON notification_log;
DROP POLICY IF EXISTS notification_log_select ON notification_log;
ALTER TABLE notification_log DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS notification_log;

-- =============================================================================
-- Drop notification_preferences
-- =============================================================================
DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_update ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_insert ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_select ON notification_preferences;
ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS notification_preferences;
