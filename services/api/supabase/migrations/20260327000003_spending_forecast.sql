-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260327000003_spending_forecast
-- Description: Database functions for spending forecast with confidence intervals
-- Issues: #328
--
-- Adds:
--   1. get_spending_summary() — aggregates spending by category and period
--   2. get_spending_forecast() — projects future spending with confidence intervals
--
-- These functions compute predictions from transaction data using statistical
-- methods (weighted moving averages with standard deviation confidence intervals).
-- They return aggregate/statistical values only — NEVER raw transaction data.
--
-- DOWN migration: at the bottom and in down/ directory.

-- =============================================================================
-- 1. get_spending_summary()
-- =============================================================================
-- Returns monthly spending aggregates by category for a household.
-- Used as input for forecasting. Returns only aggregate amounts.

CREATE OR REPLACE FUNCTION public.get_spending_summary(
    p_household_id UUID,
    p_months INTEGER DEFAULT 6,
    p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
    month_start DATE,
    category_id UUID,
    category_name TEXT,
    total_cents BIGINT,
    transaction_count BIGINT,
    currency_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('month', t.date)::DATE AS month_start,
        t.category_id,
        c.name AS category_name,
        SUM(ABS(t.amount_cents))::BIGINT AS total_cents,
        COUNT(*)::BIGINT AS transaction_count,
        t.currency_code
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
    WHERE t.household_id = p_household_id
      AND t.deleted_at IS NULL
      AND t.type != 'transfer'
      AND t.amount_cents < 0  -- expenses only
      AND t.date >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)::DATE
      AND (p_category_id IS NULL OR t.category_id = p_category_id)
    GROUP BY date_trunc('month', t.date)::DATE, t.category_id, c.name, t.currency_code
    ORDER BY month_start DESC, total_cents DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_spending_summary(UUID, INTEGER, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_spending_summary(UUID, INTEGER, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_spending_summary(UUID, INTEGER, UUID) FROM anon;

COMMENT ON FUNCTION public.get_spending_summary(UUID, INTEGER, UUID) IS
    'Returns monthly spending aggregates by category. Service_role only. '
    'Returns only aggregate amounts — NEVER raw transaction data.';

-- =============================================================================
-- 2. get_spending_forecast()
-- =============================================================================
-- Projects future spending using weighted moving average with confidence intervals.
-- Uses exponential weighting (recent months weighted more heavily).
-- Returns statistical predictions — NEVER raw financial data.

CREATE OR REPLACE FUNCTION public.get_spending_forecast(
    p_household_id UUID,
    p_months_ahead INTEGER DEFAULT 3,
    p_history_months INTEGER DEFAULT 6,
    p_category_id UUID DEFAULT NULL,
    p_confidence_level NUMERIC DEFAULT 0.95
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_categories RECORD;
    v_forecasts jsonb := '[]'::jsonb;
    v_monthly_totals BIGINT[];
    v_weights NUMERIC[];
    v_weighted_avg NUMERIC;
    v_weighted_var NUMERIC;
    v_std_dev NUMERIC;
    v_z_score NUMERIC;
    v_total_weight NUMERIC;
    v_i INTEGER;
    v_n INTEGER;
    v_month_offset INTEGER;
    v_forecast_entry jsonb;
    v_monthly_forecasts jsonb;
BEGIN
    -- Z-score for confidence level (approximation for common values)
    v_z_score := CASE
        WHEN p_confidence_level >= 0.99 THEN 2.576
        WHEN p_confidence_level >= 0.95 THEN 1.96
        WHEN p_confidence_level >= 0.90 THEN 1.645
        WHEN p_confidence_level >= 0.80 THEN 1.282
        ELSE 1.0
    END;

    -- Iterate over categories with spending data
    FOR v_categories IN
        SELECT DISTINCT category_id, category_name, currency_code
        FROM get_spending_summary(p_household_id, p_history_months, p_category_id)
        WHERE category_id IS NOT NULL
    LOOP
        -- Collect monthly totals for this category (oldest first)
        SELECT array_agg(total_cents ORDER BY month_start ASC)
        INTO v_monthly_totals
        FROM get_spending_summary(p_household_id, p_history_months, v_categories.category_id);

        v_n := array_length(v_monthly_totals, 1);

        IF v_n IS NULL OR v_n < 2 THEN
            -- Not enough data for meaningful prediction
            CONTINUE;
        END IF;

        -- Build exponential weights (more recent = higher weight)
        v_weights := ARRAY[]::NUMERIC[];
        v_total_weight := 0;
        FOR v_i IN 1..v_n LOOP
            v_weights := v_weights || (power(0.8, v_n - v_i))::NUMERIC;
            v_total_weight := v_total_weight + power(0.8, v_n - v_i);
        END LOOP;

        -- Weighted moving average
        v_weighted_avg := 0;
        FOR v_i IN 1..v_n LOOP
            v_weighted_avg := v_weighted_avg + (v_monthly_totals[v_i]::NUMERIC * v_weights[v_i]);
        END LOOP;
        v_weighted_avg := v_weighted_avg / v_total_weight;

        -- Weighted variance
        v_weighted_var := 0;
        FOR v_i IN 1..v_n LOOP
            v_weighted_var := v_weighted_var + v_weights[v_i] *
                power(v_monthly_totals[v_i]::NUMERIC - v_weighted_avg, 2);
        END LOOP;
        v_weighted_var := v_weighted_var / v_total_weight;
        v_std_dev := sqrt(v_weighted_var);

        -- Build per-month forecasts
        v_monthly_forecasts := '[]'::jsonb;
        FOR v_month_offset IN 1..p_months_ahead LOOP
            -- Widen confidence interval for further predictions
            v_monthly_forecasts := v_monthly_forecasts || jsonb_build_object(
                'month', (CURRENT_DATE + (v_month_offset || ' months')::INTERVAL)::DATE,
                'predicted_cents', round(v_weighted_avg)::BIGINT,
                'lower_bound_cents', GREATEST(0, round(v_weighted_avg - v_z_score * v_std_dev * sqrt(v_month_offset::NUMERIC)))::BIGINT,
                'upper_bound_cents', round(v_weighted_avg + v_z_score * v_std_dev * sqrt(v_month_offset::NUMERIC))::BIGINT
            );
        END LOOP;

        v_forecast_entry := jsonb_build_object(
            'category_id', v_categories.category_id,
            'category_name', v_categories.category_name,
            'currency_code', v_categories.currency_code,
            'data_points', v_n,
            'weighted_average_cents', round(v_weighted_avg)::BIGINT,
            'std_deviation_cents', round(v_std_dev)::BIGINT,
            'monthly_forecasts', v_monthly_forecasts
        );

        v_forecasts := v_forecasts || v_forecast_entry;
    END LOOP;

    RETURN jsonb_build_object(
        'household_id', p_household_id,
        'confidence_level', p_confidence_level,
        'history_months', p_history_months,
        'forecast_months', p_months_ahead,
        'forecasts', v_forecasts,
        'generated_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_spending_forecast(UUID, INTEGER, INTEGER, UUID, NUMERIC) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_spending_forecast(UUID, INTEGER, INTEGER, UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_spending_forecast(UUID, INTEGER, INTEGER, UUID, NUMERIC) FROM anon;

COMMENT ON FUNCTION public.get_spending_forecast(UUID, INTEGER, INTEGER, UUID, NUMERIC) IS
    'Projects future spending using weighted moving average with confidence intervals. '
    'Returns statistical predictions — NEVER raw transaction data. Service_role only.';

-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.get_spending_forecast(UUID, INTEGER, INTEGER, UUID, NUMERIC);
-- DROP FUNCTION IF EXISTS public.get_spending_summary(UUID, INTEGER, UUID);
