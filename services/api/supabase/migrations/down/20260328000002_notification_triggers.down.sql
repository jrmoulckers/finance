-- SPDX-License-Identifier: BUSL-1.1

-- Down migration for: 20260328000002_notification_triggers
-- Reverts notification triggers and notifications table (#1051)

DROP FUNCTION IF EXISTS public.detect_unusual_spending();
DROP FUNCTION IF EXISTS public.detect_goal_milestone_notifications();
DROP FUNCTION IF EXISTS public.detect_budget_threshold_notifications();
DROP TRIGGER IF EXISTS trg_notifications_updated_at ON notifications;
DROP TABLE IF EXISTS notifications;
