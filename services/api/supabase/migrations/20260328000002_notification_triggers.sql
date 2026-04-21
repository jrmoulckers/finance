-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000002_notification_triggers
-- Description: Add notifications table and trigger detection functions
-- Issues: #1051
--
-- Changes:
--   1. Create `notifications` table for in-app notification storage
--   2. Add RLS policies (household-scoped + user-scoped)
--   3. Create `detect_budget_threshold_notifications` function
--   4. Create `detect_goal_milestone_notifications` function
--   5. Create `detect_unusual_spending` function
--
-- Security:
--   - RLS enabled on notifications table
--   - Users can only see their own notifications
--   - INSERT restricted to service_role (Edge Functions)
--   - Detection functions are SECURITY DEFINER with service_role GRANT
--   - NEVER include raw financial amounts in notification messages
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- 1. notifications table
-- =============================================================================

CREATE TABLE notifications (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    owner_id            UUID        REFERENCES auth.users(id),
    type                TEXT        NOT NULL CHECK (type IN (
                            'budget_warning',
                            'budget_exceeded',
                            'goal_milestone',
                            'goal_completed',
                            'unusual_spending',
                            'system'
                        )),
    title               TEXT        NOT NULL,
    message             TEXT        NOT NULL,
    metadata            JSONB       DEFAULT '{}',
    is_read             BOOLEAN     NOT NULL DEFAULT false,
    read_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

-- User's notification feed (most recent first)
CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Household lookup
CREATE INDEX idx_notifications_household
    ON notifications (household_id)
    WHERE deleted_at IS NULL;

-- Unread notification count
CREATE INDEX idx_notifications_unread
    ON notifications (user_id, is_read)
    WHERE deleted_at IS NULL AND is_read = false;

-- Type filtering
CREATE INDEX idx_notifications_type
    ON notifications (type, created_at DESC)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE notifications IS
    'In-app notifications for budget alerts, goal milestones, and unusual spending detection (#1051).';
COMMENT ON COLUMN notifications.type IS
    'Notification category: budget_warning (80%), budget_exceeded (100%), goal_milestone (25/50/75%), goal_completed (100%), unusual_spending, system.';
COMMENT ON COLUMN notifications.metadata IS
    'Structured notification context (e.g. budget_id, goal_id, threshold_pct). NEVER store raw financial amounts.';

-- =============================================================================
-- RLS policies
-- =============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY notifications_select ON notifications
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update ON notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can soft-delete their own notifications
CREATE POLICY notifications_delete ON notifications
    FOR DELETE
    USING (user_id = auth.uid());

-- INSERT restricted to service_role only (Edge Functions)
CREATE POLICY notifications_insert ON notifications
    FOR INSERT
    WITH CHECK (false);

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER trg_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 2. detect_budget_threshold_notifications
-- =============================================================================
-- Scans all active budgets and compares spent amounts against thresholds.
-- Returns notifications for budgets at 80% and 100%+ utilization.
-- Only generates notifications that haven't been created recently (24h window).

CREATE OR REPLACE FUNCTION public.detect_budget_threshold_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    budget_rec RECORD;
    spent_cents BIGINT;
    utilization_pct NUMERIC;
    notification_count INTEGER := 0;
    v_members UUID[];
    v_member UUID;
BEGIN
    FOR budget_rec IN
        SELECT b.id, b.household_id, b.category_id, b.amount_cents,
               b.currency_code, b.period, b.start_date,
               c.name AS category_name
        FROM budgets b
        JOIN categories c ON c.id = b.category_id AND c.deleted_at IS NULL
        WHERE b.deleted_at IS NULL
          AND b.amount_cents > 0
    LOOP
        -- Calculate spent amount for current period
        SELECT COALESCE(SUM(ABS(t.amount_cents)), 0)
        INTO spent_cents
        FROM transactions t
        WHERE t.household_id = budget_rec.household_id
          AND t.category_id = budget_rec.category_id
          AND t.deleted_at IS NULL
          AND t.type IN ('EXPENSE', 'TRANSFER_OUT')
          AND t.date >= CASE budget_rec.period
              WHEN 'monthly' THEN date_trunc('month', CURRENT_DATE)::date
              WHEN 'weekly' THEN date_trunc('week', CURRENT_DATE)::date
              WHEN 'yearly' THEN date_trunc('year', CURRENT_DATE)::date
              ELSE budget_rec.start_date
          END;

        utilization_pct := (spent_cents::NUMERIC / budget_rec.amount_cents::NUMERIC) * 100;

        -- Check 100% threshold
        IF utilization_pct >= 100 THEN
            -- Skip if we already sent this notification in the last 24h
            IF NOT EXISTS (
                SELECT 1 FROM notifications
                WHERE household_id = budget_rec.household_id
                  AND type = 'budget_exceeded'
                  AND (metadata->>'budget_id')::UUID = budget_rec.id
                  AND created_at > now() - INTERVAL '24 hours'
                  AND deleted_at IS NULL
            ) THEN
                -- Notify all household members
                SELECT array_agg(user_id) INTO v_members
                FROM household_members
                WHERE household_id = budget_rec.household_id
                  AND deleted_at IS NULL;

                IF v_members IS NOT NULL THEN
                    FOREACH v_member IN ARRAY v_members LOOP
                        INSERT INTO notifications (
                            user_id, household_id, owner_id, type, title, message, metadata
                        ) VALUES (
                            v_member,
                            budget_rec.household_id,
                            v_member,
                            'budget_exceeded',
                            'Budget Exceeded',
                            'Your ' || budget_rec.category_name || ' budget has been exceeded.',
                            jsonb_build_object(
                                'budget_id', budget_rec.id,
                                'category_id', budget_rec.category_id,
                                'category_name', budget_rec.category_name,
                                'threshold_pct', 100,
                                'utilization_pct', round(utilization_pct, 1)
                            )
                        );
                        notification_count := notification_count + 1;
                    END LOOP;
                END IF;
            END IF;
        -- Check 80% threshold
        ELSIF utilization_pct >= 80 THEN
            IF NOT EXISTS (
                SELECT 1 FROM notifications
                WHERE household_id = budget_rec.household_id
                  AND type = 'budget_warning'
                  AND (metadata->>'budget_id')::UUID = budget_rec.id
                  AND created_at > now() - INTERVAL '24 hours'
                  AND deleted_at IS NULL
            ) THEN
                SELECT array_agg(user_id) INTO v_members
                FROM household_members
                WHERE household_id = budget_rec.household_id
                  AND deleted_at IS NULL;

                IF v_members IS NOT NULL THEN
                    FOREACH v_member IN ARRAY v_members LOOP
                        INSERT INTO notifications (
                            user_id, household_id, owner_id, type, title, message, metadata
                        ) VALUES (
                            v_member,
                            budget_rec.household_id,
                            v_member,
                            'budget_warning',
                            'Budget Warning',
                            'Your ' || budget_rec.category_name || ' budget is at ' || round(utilization_pct, 0) || '% utilization.',
                            jsonb_build_object(
                                'budget_id', budget_rec.id,
                                'category_id', budget_rec.category_id,
                                'category_name', budget_rec.category_name,
                                'threshold_pct', 80,
                                'utilization_pct', round(utilization_pct, 1)
                            )
                        );
                        notification_count := notification_count + 1;
                    END LOOP;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'notifications_created', notification_count,
        'checked_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_budget_threshold_notifications() TO service_role;
REVOKE EXECUTE ON FUNCTION public.detect_budget_threshold_notifications() FROM PUBLIC;

-- =============================================================================
-- 3. detect_goal_milestone_notifications
-- =============================================================================

CREATE OR REPLACE FUNCTION public.detect_goal_milestone_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    goal_rec RECORD;
    progress_pct NUMERIC;
    milestone INTEGER;
    milestones INTEGER[] := ARRAY[25, 50, 75, 100];
    notification_count INTEGER := 0;
    v_members UUID[];
    v_member UUID;
    v_type TEXT;
    v_title TEXT;
    v_message TEXT;
BEGIN
    FOR goal_rec IN
        SELECT g.id, g.household_id, g.name, g.target_cents, g.current_cents,
               g.currency_code, g.status
        FROM goals g
        WHERE g.deleted_at IS NULL
          AND g.target_cents > 0
          AND (g.status IS NULL OR g.status = 'active')
    LOOP
        progress_pct := (goal_rec.current_cents::NUMERIC / goal_rec.target_cents::NUMERIC) * 100;

        FOREACH milestone IN ARRAY milestones LOOP
            -- Check if goal has reached this milestone
            IF progress_pct >= milestone THEN
                -- Skip if we already sent this milestone notification
                IF NOT EXISTS (
                    SELECT 1 FROM notifications
                    WHERE household_id = goal_rec.household_id
                      AND ((metadata->>'goal_id')::UUID = goal_rec.id)
                      AND ((metadata->>'milestone_pct')::INTEGER = milestone)
                      AND deleted_at IS NULL
                ) THEN
                    -- Determine notification type and message
                    IF milestone = 100 THEN
                        v_type := 'goal_completed';
                        v_title := 'Goal Completed!';
                        v_message := 'Congratulations! Your goal "' || goal_rec.name || '" has been reached!';
                    ELSE
                        v_type := 'goal_milestone';
                        v_title := 'Goal Milestone: ' || milestone || '%';
                        v_message := 'Your goal "' || goal_rec.name || '" is ' || milestone || '% complete.';
                    END IF;

                    -- Notify all household members
                    SELECT array_agg(user_id) INTO v_members
                    FROM household_members
                    WHERE household_id = goal_rec.household_id
                      AND deleted_at IS NULL;

                    IF v_members IS NOT NULL THEN
                        FOREACH v_member IN ARRAY v_members LOOP
                            INSERT INTO notifications (
                                user_id, household_id, owner_id, type, title, message, metadata
                            ) VALUES (
                                v_member,
                                goal_rec.household_id,
                                v_member,
                                v_type,
                                v_title,
                                v_message,
                                jsonb_build_object(
                                    'goal_id', goal_rec.id,
                                    'goal_name', goal_rec.name,
                                    'milestone_pct', milestone,
                                    'progress_pct', round(progress_pct, 1)
                                )
                            );
                            notification_count := notification_count + 1;
                        END LOOP;
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'notifications_created', notification_count,
        'checked_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_goal_milestone_notifications() TO service_role;
REVOKE EXECUTE ON FUNCTION public.detect_goal_milestone_notifications() FROM PUBLIC;

-- =============================================================================
-- 4. detect_unusual_spending
-- =============================================================================
-- Compares the current week's spending against the 4-week rolling average.
-- If spending exceeds 2x the average, generates an unusual spending notification.

CREATE OR REPLACE FUNCTION public.detect_unusual_spending()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    hh_rec RECORD;
    current_week_cents BIGINT;
    avg_weekly_cents BIGINT;
    notification_count INTEGER := 0;
    v_members UUID[];
    v_member UUID;
BEGIN
    FOR hh_rec IN
        SELECT id FROM households WHERE deleted_at IS NULL
    LOOP
        -- Current week spending
        SELECT COALESCE(SUM(ABS(amount_cents)), 0)
        INTO current_week_cents
        FROM transactions
        WHERE household_id = hh_rec.id
          AND deleted_at IS NULL
          AND type IN ('EXPENSE', 'TRANSFER_OUT')
          AND date >= date_trunc('week', CURRENT_DATE)::date;

        -- Average weekly spending over the last 4 weeks (excluding current week)
        SELECT COALESCE(SUM(ABS(amount_cents)) / NULLIF(4, 0), 0)
        INTO avg_weekly_cents
        FROM transactions
        WHERE household_id = hh_rec.id
          AND deleted_at IS NULL
          AND type IN ('EXPENSE', 'TRANSFER_OUT')
          AND date >= (CURRENT_DATE - INTERVAL '4 weeks')::date
          AND date < date_trunc('week', CURRENT_DATE)::date;

        -- Only alert if there's a meaningful baseline and current spending is 2x+ average
        IF avg_weekly_cents > 0 AND current_week_cents > (avg_weekly_cents * 2) THEN
            -- Skip if already notified this week
            IF NOT EXISTS (
                SELECT 1 FROM notifications
                WHERE household_id = hh_rec.id
                  AND type = 'unusual_spending'
                  AND created_at > date_trunc('week', now())
                  AND deleted_at IS NULL
            ) THEN
                SELECT array_agg(user_id) INTO v_members
                FROM household_members
                WHERE household_id = hh_rec.id
                  AND deleted_at IS NULL;

                IF v_members IS NOT NULL THEN
                    FOREACH v_member IN ARRAY v_members LOOP
                        INSERT INTO notifications (
                            user_id, household_id, owner_id, type, title, message, metadata
                        ) VALUES (
                            v_member,
                            hh_rec.id,
                            v_member,
                            'unusual_spending',
                            'Unusual Spending Detected',
                            'Your household spending this week is significantly higher than your recent average.',
                            jsonb_build_object(
                                'household_id', hh_rec.id,
                                'spending_ratio', round((current_week_cents::NUMERIC / avg_weekly_cents::NUMERIC), 2)
                            )
                        );
                        notification_count := notification_count + 1;
                    END LOOP;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'notifications_created', notification_count,
        'checked_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_unusual_spending() TO service_role;
REVOKE EXECUTE ON FUNCTION public.detect_unusual_spending() FROM PUBLIC;

-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.detect_unusual_spending();
-- DROP FUNCTION IF EXISTS public.detect_goal_milestone_notifications();
-- DROP FUNCTION IF EXISTS public.detect_budget_threshold_notifications();
-- DROP TRIGGER IF EXISTS trg_notifications_updated_at ON notifications;
-- DROP TABLE IF EXISTS notifications;
