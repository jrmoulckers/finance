-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260906000002_revenuecat_purchase_aliases (#4401)
--
-- LOCAL/UNSHIPPED SCHEMA ONLY. Once real RevenueCat aliases exist, disable the
-- adapter and forward-repair rather than deleting immutable purchase evidence.

DROP FUNCTION IF EXISTS public.resolve_revenuecat_purchase_binding(
    UUID, TEXT, TEXT, TEXT, TEXT[]
);
DROP TRIGGER IF EXISTS trg_billing_provider_purchase_alias_immutable
    ON billing_provider_purchase_aliases;
DROP FUNCTION IF EXISTS public.protect_billing_provider_purchase_alias();
DROP TABLE IF EXISTS billing_provider_purchase_aliases;
