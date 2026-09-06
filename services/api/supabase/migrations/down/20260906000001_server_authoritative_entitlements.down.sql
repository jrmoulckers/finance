-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260906000001_server_authoritative_entitlements (#4400)
--
-- LOCAL/UNSHIPPED SCHEMA ONLY. This deterministic down migration destroys
-- normalized provider evidence. It must never be run after an environment has
-- processed real provider events. After production use, rollback means disable
-- adapters/enforcement and forward-repair or restore into an approved
-- non-production environment for independently verified reconciliation.

DROP TRIGGER IF EXISTS trg_household_members_refresh_entitlements ON household_members;
DROP FUNCTION IF EXISTS public.refresh_entitlements_after_membership_change();

DROP POLICY IF EXISTS family_plan_select ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_insert ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_update ON family_plan_subscriptions;
DROP POLICY IF EXISTS family_plan_delete ON family_plan_subscriptions;

CREATE POLICY family_plan_select ON family_plan_subscriptions
    FOR SELECT USING (household_id = ANY(public.household_ids()));
CREATE POLICY family_plan_insert ON family_plan_subscriptions
    FOR INSERT WITH CHECK (
        billing_owner_id = auth.uid()
        AND household_id = ANY(public.household_ids())
    );
CREATE POLICY family_plan_update ON family_plan_subscriptions
    FOR UPDATE USING (billing_owner_id = auth.uid())
    WITH CHECK (billing_owner_id = auth.uid());
CREATE POLICY family_plan_delete ON family_plan_subscriptions
    FOR DELETE USING (billing_owner_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE family_plan_subscriptions TO authenticated;

COMMENT ON TABLE family_plan_subscriptions IS
    'Family premium plan subscriptions per household. One active subscription per household. Billing owner manages the plan.';

DROP FUNCTION IF EXISTS public.get_my_entitlements(UUID);
DROP FUNCTION IF EXISTS public.clear_my_premium_household_sponsorship(UUID);
DROP FUNCTION IF EXISTS public.set_my_premium_household_sponsorship(UUID);
DROP FUNCTION IF EXISTS public.rebuild_billing_entitlements(UUID);
DROP FUNCTION IF EXISTS public.apply_billing_provider_event(UUID);
DROP FUNCTION IF EXISTS public.record_billing_provider_event(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ,
    BIGINT, TEXT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ,
    TIMESTAMPTZ, UUID, BOOLEAN
);
DROP TRIGGER IF EXISTS trg_billing_account_owner_entitlements ON billing_accounts;
DROP FUNCTION IF EXISTS public.rebuild_entitlements_after_owner_pseudonymization();
DROP FUNCTION IF EXISTS public.rebuild_billing_account_entitlements_internal(UUID);
DROP FUNCTION IF EXISTS public.replay_billing_account_subscriptions_internal(UUID);
DROP FUNCTION IF EXISTS public.refresh_household_entitlement_projection(UUID);
DROP FUNCTION IF EXISTS public.refresh_user_entitlement_projection(UUID);
DROP FUNCTION IF EXISTS public.lock_billing_accounts_internal(UUID[]);
DROP FUNCTION IF EXISTS public.billing_purchase_lock_key(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.billing_subscription_access_expires_at(TEXT, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.billing_event_precedence(TEXT);

DROP TRIGGER IF EXISTS trg_billing_provider_event_immutable ON billing_provider_events;
DROP FUNCTION IF EXISTS public.protect_billing_provider_event();
DROP TRIGGER IF EXISTS trg_billing_subscription_identity_immutable ON billing_subscriptions;
DROP FUNCTION IF EXISTS public.protect_billing_subscription_identity();
DROP TRIGGER IF EXISTS trg_billing_provider_identity_immutable ON billing_provider_identities;
DROP FUNCTION IF EXISTS public.protect_billing_provider_identity();
DROP TRIGGER IF EXISTS trg_billing_provider_purchase_binding_immutable ON billing_provider_purchase_bindings;
DROP FUNCTION IF EXISTS public.protect_billing_provider_purchase_binding();

DROP TRIGGER IF EXISTS trg_entitlement_grants_updated_at ON entitlement_grants;
DROP TRIGGER IF EXISTS trg_billing_subscriptions_updated_at ON billing_subscriptions;
DROP TRIGGER IF EXISTS trg_billing_provider_identities_updated_at ON billing_provider_identities;
DROP TRIGGER IF EXISTS trg_billing_account_owner_pseudonymized ON billing_accounts;
DROP FUNCTION IF EXISTS public.pseudonymize_billing_account_owner();
DROP TRIGGER IF EXISTS trg_billing_accounts_updated_at ON billing_accounts;

DROP TABLE IF EXISTS current_household_entitlements;
DROP TABLE IF EXISTS current_user_entitlements;
DROP TABLE IF EXISTS entitlement_grants;
DROP TABLE IF EXISTS billing_subscriptions;
DROP TABLE IF EXISTS billing_provider_events;
DROP TABLE IF EXISTS billing_provider_purchase_bindings;
DROP TABLE IF EXISTS billing_provider_identities;
DROP TABLE IF EXISTS billing_accounts;
