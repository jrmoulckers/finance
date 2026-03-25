-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260324000004_webhook_infrastructure
-- Description: Webhook system for external integrations with event delivery,
--              retry logic, and HMAC signature verification.
-- Issues: #683
--
-- Webhook Lifecycle:
--   1. Household owner/admin registers an endpoint (URL + event subscriptions).
--   2. A server-side HMAC signing secret is generated and returned ONCE.
--   3. When a subscribed event fires, a delivery record is created.
--   4. The Edge Function POSTs the event payload to the endpoint URL with
--      an HMAC-SHA256 signature header (X-Webhook-Signature).
--   5. On success (2xx): failure_count resets, last_success_at updates.
--   6. On failure (non-2xx / timeout): failure_count increments, delivery
--      is scheduled for retry with exponential backoff (2^attempt seconds,
--      capped at 1 hour, ±10% jitter).
--   7. After max_attempts (default 5) the delivery is marked 'failed'.
--   8. After 10 consecutive failures the endpoint is auto-disabled.
--
-- Retry Strategy:
--   attempt 1: ~2s,  attempt 2: ~4s,  attempt 3: ~8s,
--   attempt 4: ~16s, attempt 5: ~32s  (all ±10% jitter)
--   Capped at 3600s (1 hour) for any attempt beyond ~12.

-- =============================================================================
-- Valid event types (reference list)
-- =============================================================================
-- transaction.created, transaction.updated, transaction.deleted,
-- account.created, account.updated, account.deleted,
-- budget.created, budget.updated, budget.threshold_reached,
-- goal.created, goal.updated, goal.completed,
-- household.member_joined, household.member_left,
-- invitation.created, invitation.accepted

-- =============================================================================
-- Helper: generate_webhook_secret()
-- =============================================================================
-- Returns a cryptographically random 32-byte hex string suitable for
-- HMAC-SHA256 signing. Uses gen_random_bytes() from pgcrypto.

CREATE OR REPLACE FUNCTION public.generate_webhook_secret()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_webhook_secret() IS
    'Generate a random 32-byte hex string for HMAC webhook signing.';

-- =============================================================================
-- webhook_endpoints
-- =============================================================================
-- Registered webhook endpoints that receive event notifications.
-- Each endpoint belongs to a household and is managed by owners/admins.

CREATE TABLE webhook_endpoints (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID        NOT NULL REFERENCES households(id),
    url             TEXT        NOT NULL
                    CONSTRAINT  webhook_endpoints_url_max_length
                        CHECK (char_length(url) <= 2048)
                    CONSTRAINT  webhook_endpoints_url_https
                        CHECK (url LIKE 'https://%'),
    secret          TEXT        NOT NULL DEFAULT public.generate_webhook_secret(),
    description     TEXT,
    events          TEXT[]      NOT NULL
                    CONSTRAINT  webhook_endpoints_events_nonempty
                        CHECK (array_length(events, 1) >= 1),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    failure_count   INTEGER     NOT NULL DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    created_by      UUID        NOT NULL REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Validate that all event types in the array are from the allowed set
CREATE OR REPLACE FUNCTION public.validate_webhook_events(events TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    valid_events TEXT[] := ARRAY[
        'transaction.created', 'transaction.updated', 'transaction.deleted',
        'account.created', 'account.updated', 'account.deleted',
        'budget.created', 'budget.updated', 'budget.threshold_reached',
        'goal.created', 'goal.updated', 'goal.completed',
        'household.member_joined', 'household.member_left',
        'invitation.created', 'invitation.accepted'
    ];
    event TEXT;
BEGIN
    FOREACH event IN ARRAY events LOOP
        IF NOT (event = ANY(valid_events)) THEN
            RETURN false;
        END IF;
    END LOOP;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_events_valid
    CHECK (public.validate_webhook_events(events));

COMMENT ON TABLE webhook_endpoints IS
    'Registered webhook endpoints for external integrations. '
    'Each endpoint subscribes to specific event types and receives '
    'HMAC-signed POST payloads when those events occur.';

COMMENT ON COLUMN webhook_endpoints.secret IS
    'HMAC-SHA256 signing secret. Generated server-side, returned ONLY on creation. '
    'NEVER include in list/get responses.';

COMMENT ON COLUMN webhook_endpoints.events IS
    'Array of event types this endpoint subscribes to.';

COMMENT ON COLUMN webhook_endpoints.failure_count IS
    'Consecutive delivery failures. Resets to 0 on success. '
    'Endpoint is auto-disabled when this exceeds the threshold (default 10).';

-- =============================================================================
-- webhook_deliveries
-- =============================================================================
-- Individual delivery attempts for webhook events. Tracks status, retries,
-- and response metadata for debugging and monitoring.

CREATE TABLE webhook_deliveries (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_endpoint_id UUID        NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type          TEXT        NOT NULL,
    payload             JSONB       NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'pending'
                        CONSTRAINT  webhook_deliveries_status_valid
                            CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
    attempt_count       INTEGER     NOT NULL DEFAULT 0,
    max_attempts        INTEGER     NOT NULL DEFAULT 5,
    next_retry_at       TIMESTAMPTZ,
    response_status     INTEGER,
    response_body       TEXT
                        CONSTRAINT  webhook_deliveries_response_body_max
                            CHECK (response_body IS NULL OR char_length(response_body) <= 1000),
    error_message       TEXT,
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE webhook_deliveries IS
    'Individual webhook delivery attempts with retry tracking. '
    'Deliveries use exponential backoff (2^attempt seconds, capped at 1 hour). '
    'After max_attempts (default 5) the delivery is marked as failed.';

COMMENT ON COLUMN webhook_deliveries.response_body IS
    'First 1000 characters of the response body, for debugging failed deliveries.';

COMMENT ON COLUMN webhook_deliveries.next_retry_at IS
    'When the next retry attempt should be made. NULL for delivered or terminal failures.';

-- =============================================================================
-- Indexes
-- =============================================================================

-- Active endpoints for a household (soft-delete filtered)
CREATE INDEX idx_webhook_endpoints_household
    ON webhook_endpoints (household_id)
    WHERE deleted_at IS NULL;

-- Delivery history for an endpoint (most recent first)
CREATE INDEX idx_webhook_deliveries_endpoint
    ON webhook_deliveries (webhook_endpoint_id, created_at DESC);

-- Pending/retrying deliveries for the retry processor
CREATE INDEX idx_webhook_deliveries_pending
    ON webhook_deliveries (status, next_retry_at)
    WHERE status IN ('pending', 'retrying');

-- Delivered items for cleanup/archival
CREATE INDEX idx_webhook_deliveries_cleanup
    ON webhook_deliveries (created_at)
    WHERE status = 'delivered';

-- =============================================================================
-- RLS — Enable on both tables
-- =============================================================================

ALTER TABLE webhook_endpoints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- webhook_endpoints: Only household owners/admins can manage endpoints
-- ---------------------------------------------------------------------------

CREATE POLICY webhook_endpoints_select ON webhook_endpoints
    FOR SELECT
    USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
              AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY webhook_endpoints_insert ON webhook_endpoints
    FOR INSERT
    WITH CHECK (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
              AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY webhook_endpoints_update ON webhook_endpoints
    FOR UPDATE
    USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
              AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
              AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY webhook_endpoints_delete ON webhook_endpoints
    FOR DELETE
    USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
              AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

-- ---------------------------------------------------------------------------
-- webhook_deliveries: Users can view deliveries for their household's endpoints
-- ---------------------------------------------------------------------------

CREATE POLICY webhook_deliveries_select ON webhook_deliveries
    FOR SELECT
    USING (
        webhook_endpoint_id IN (
            SELECT we.id FROM webhook_endpoints we
            INNER JOIN household_members hm
                ON hm.household_id = we.household_id
            WHERE hm.user_id = auth.uid()
              AND hm.deleted_at IS NULL
              AND hm.role IN ('owner', 'admin')
              AND we.deleted_at IS NULL
        )
    );

-- Deliveries are created by the system (service role), not end users.
-- No INSERT/UPDATE/DELETE policies for webhook_deliveries — only service role writes.

-- =============================================================================
-- Triggers
-- =============================================================================

-- Reuse existing updated_at trigger function from initial schema
CREATE TRIGGER trg_webhook_endpoints_updated_at
    BEFORE UPDATE ON webhook_endpoints
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- After failed delivery: increment failure_count, update last_failure_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.webhook_delivery_failure_handler()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'failed' OR NEW.status = 'retrying' THEN
        UPDATE webhook_endpoints
        SET failure_count = failure_count + 1,
            last_failure_at = now()
        WHERE id = NEW.webhook_endpoint_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_webhook_delivery_failure
    AFTER INSERT OR UPDATE ON webhook_deliveries
    FOR EACH ROW
    WHEN (NEW.status IN ('failed', 'retrying'))
    EXECUTE FUNCTION public.webhook_delivery_failure_handler();

-- ---------------------------------------------------------------------------
-- After successful delivery: reset failure_count, update last_success_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.webhook_delivery_success_handler()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'delivered' THEN
        UPDATE webhook_endpoints
        SET failure_count = 0,
            last_success_at = now()
        WHERE id = NEW.webhook_endpoint_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_webhook_delivery_success
    AFTER INSERT OR UPDATE ON webhook_deliveries
    FOR EACH ROW
    WHEN (NEW.status = 'delivered')
    EXECUTE FUNCTION public.webhook_delivery_success_handler();

-- =============================================================================
-- Auto-disable failing endpoints
-- =============================================================================

CREATE OR REPLACE FUNCTION public.disable_failing_webhook(
    p_endpoint_id UUID,
    p_max_failures INTEGER DEFAULT 10
)
RETURNS VOID AS $$
BEGIN
    UPDATE webhook_endpoints
    SET is_active = false
    WHERE id = p_endpoint_id
      AND failure_count >= p_max_failures
      AND is_active = true
      AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.disable_failing_webhook(UUID, INTEGER) IS
    'Disable a webhook endpoint when its failure_count exceeds the threshold. '
    'Called after delivery failures to auto-disable consistently failing endpoints.';

-- ---------------------------------------------------------------------------
-- Trigger to auto-disable after failure count update
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.webhook_auto_disable_handler()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.failure_count >= 10 AND NEW.is_active = true THEN
        NEW.is_active := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_webhook_auto_disable
    BEFORE UPDATE ON webhook_endpoints
    FOR EACH ROW
    WHEN (NEW.failure_count >= 10 AND NEW.is_active = true)
    EXECUTE FUNCTION public.webhook_auto_disable_handler();
