-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260327000003_spending_forecast
-- Description: Drop spending forecast functions
-- Issues: #328

DROP FUNCTION IF EXISTS public.get_spending_forecast(UUID, INTEGER, INTEGER, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.get_spending_summary(UUID, INTEGER, UUID);
