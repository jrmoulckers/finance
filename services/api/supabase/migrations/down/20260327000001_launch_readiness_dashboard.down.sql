-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260327000001_launch_readiness_dashboard
-- Description: Drop launch readiness dashboard objects
-- Issues: #894

DROP FUNCTION IF EXISTS public.get_launch_readiness();
DROP FUNCTION IF EXISTS public.refresh_launch_readiness();
DROP MATERIALIZED VIEW IF EXISTS public.launch_readiness_checks;
