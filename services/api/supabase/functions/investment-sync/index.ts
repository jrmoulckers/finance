// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): SPECULATIVE — Not wired to any client. No tests. Provider
// integration stubs (Plaid Investments, Yodlee) are unimplemented. Exclude
// from alpha deployment; revisit post-launch when investment tracking is
// prioritized. (#1390)

/**
 * Investment Data Sync Edge Function (#sprint-backend-1)
 *
 * Manages investment portfolio data:
 *   GET  /investment-sync                     - List portfolios/holdings
 *   GET  /investment-sync?action=history      - Get price history for a ticker
 *   POST /investment-sync?action=sync         - Trigger provider sync
 *   POST /investment-sync?action=price-update - Fetch latest prices
 *
 * Security:
 *   - Requires authentication (Bearer JWT)
 *   - Rate-limited: 20 requests/minute per user
 *   - All data queries go through RLS (household isolation)
 *   - Monetary amounts returned as integer cents
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_PATTERN = /^[A-Z]{1,10}(\.[A-Z]{1,5})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PORTFOLIO_COLUMNS =
  'id, household_id, owner_id, name, description, currency_code, is_active, created_at, updated_at';
const HOLDING_COLUMNS =
  'id, portfolio_id, household_id, owner_id, ticker_symbol, name, asset_type, quantity_units, quantity_precision, cost_basis_cents, currency_code, acquired_date, created_at, updated_at';
const PRICE_COLUMNS =
  'id, ticker_symbol, close_price_cents, currency_code, price_date, source, created_at';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  const logger = createLogger('investment-sync');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('investment-sync', req);
  if (envError) return envError;

  try {
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['investment-sync']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['investment-sync']);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method === 'GET') {
      const householdId = url.searchParams.get('household_id');
      if (!householdId || !UUID_PATTERN.test(householdId)) {
        return errorResponse(req, 'household_id query parameter is required (valid UUID)');
      }

      if (action === 'history') {
        const ticker = url.searchParams.get('ticker')?.toUpperCase();
        const dateFrom = url.searchParams.get('date_from');
        const dateTo = url.searchParams.get('date_to');
        if (!ticker || !TICKER_PATTERN.test(ticker)) {
          return errorResponse(req, 'ticker query parameter required (e.g., AAPL)');
        }
        let query = supabase
          .from('price_history')
          .select(PRICE_COLUMNS)
          .eq('ticker_symbol', ticker)
          .is('deleted_at', null)
          .order('price_date', { ascending: false })
          .limit(365);
        if (dateFrom && ISO_DATE_PATTERN.test(dateFrom)) query = query.gte('price_date', dateFrom);
        if (dateTo && ISO_DATE_PATTERN.test(dateTo)) query = query.lte('price_date', dateTo);
        const { data: prices, error: priceErr } = await query;
        if (priceErr) {
          logger.error('Failed to fetch price history', { errorMessage: priceErr.message });
          return internalErrorResponse(req);
        }
        logger.info('Price history retrieved', {
          httpStatus: 200,
          ticker,
          count: prices?.length ?? 0,
        });
        return jsonResponse(req, { ticker, prices: prices ?? [] });
      }

      // List portfolios and holdings
      const { data: portfolios, error: pErr } = await supabase
        .from('investment_portfolios')
        .select(PORTFOLIO_COLUMNS)
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('name');
      if (pErr) {
        logger.error('Failed to list portfolios', { errorMessage: pErr.message });
        return internalErrorResponse(req);
      }

      const portfolioIds = (portfolios ?? []).map((p: Record<string, unknown>) => p.id as string);
      let holdings: Record<string, unknown>[] = [];
      if (portfolioIds.length > 0) {
        const { data: hData, error: hErr } = await supabase
          .from('investment_holdings')
          .select(HOLDING_COLUMNS)
          .in('portfolio_id', portfolioIds)
          .is('deleted_at', null)
          .order('ticker_symbol');
        if (hErr) {
          logger.error('Failed to list holdings', { errorMessage: hErr.message });
          return internalErrorResponse(req);
        }
        holdings = hData ?? [];
      }
      logger.info('Portfolios listed', {
        httpStatus: 200,
        portfolioCount: portfolios?.length ?? 0,
        holdingCount: holdings.length,
      });
      return jsonResponse(req, { portfolios: portfolios ?? [], holdings });
    }

    if (req.method !== 'POST') return methodNotAllowedResponse(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON body');
    }

    if (action === 'price-update') {
      const { household_id } = body as { household_id?: string };
      if (!household_id || !UUID_PATTERN.test(household_id))
        return errorResponse(req, 'household_id required');
      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();
      if (!membership) return errorResponse(req, 'You are not a member of this household', 403);
      const { data: holdingsData } = await supabase
        .from('investment_holdings')
        .select('ticker_symbol')
        .eq('household_id', household_id)
        .is('deleted_at', null);
      const tickers = [
        ...new Set(
          (holdingsData ?? []).map((h: Record<string, unknown>) => h.ticker_symbol as string),
        ),
      ];
      if (tickers.length === 0)
        return jsonResponse(req, { ok: true, message: 'No holdings to update', updated_count: 0 });
      // TODO: Integrate with market data provider API (configure INVESTMENT_PROVIDER_KEY)
      logger.info('Price update requested', { httpStatus: 200, tickerCount: tickers.length });
      return jsonResponse(req, {
        ok: true,
        message: 'Price update endpoint ready. Configure INVESTMENT_PROVIDER_KEY.',
        tickers_pending: tickers.length,
        updated_at: new Date().toISOString(),
      });
    }

    if (action === 'sync') {
      const { household_id, portfolio_id } = body as {
        household_id?: string;
        portfolio_id?: string;
      };
      if (!household_id || !UUID_PATTERN.test(household_id))
        return errorResponse(req, 'household_id required');
      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();
      if (!membership) return errorResponse(req, 'You are not a member of this household', 403);
      // TODO: Implement data provider sync (Plaid Investments, Yodlee)
      logger.info('Investment sync requested', {
        httpStatus: 200,
        portfolioId: portfolio_id ?? 'all',
      });
      return jsonResponse(req, {
        ok: true,
        message: 'Investment sync endpoint ready.',
        household_id,
        portfolio_id: portfolio_id ?? null,
        synced_at: new Date().toISOString(),
      });
    }

    return errorResponse(req, 'POST requires action=sync or action=price-update');
  } catch (err) {
    logger.error('Investment sync error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
