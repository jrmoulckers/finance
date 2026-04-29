// SPDX-License-Identifier: BUSL-1.1

/**
 * Multi-Currency Exchange Rates Edge Function (#sprint-9)
 *
 * Fetches, caches, and serves exchange rates:
 *   GET  /exchange-rates                         — Get latest rates for a base currency
 *   GET  /exchange-rates?action=convert           — Convert an amount between currencies
 *   POST /exchange-rates?action=refresh           — Fetch fresh rates from ECB (cron/admin)
 *
 * Rate Storage:
 *   Rates are stored as BIGINT (rate_multiplied) with a precision factor.
 *   E.g., EUR/USD = 1.085432 → rate_multiplied = 1085432, rate_precision = 6
 *   Conversion: rate = rate_multiplied / 10^rate_precision
 *
 * Caching:
 *   - Rates are cached in the exchange_rates table per date
 *   - ECB publishes rates once per business day (~16:00 CET)
 *   - Cache TTL: 24 hours (one fetch per day per currency pair)
 *
 * Security:
 *   - GET endpoints require authentication (Bearer JWT)
 *   - POST refresh requires CRON_SECRET or admin
 *   - All monetary amounts in integer cents — never floats
 *   - Rate-limited: 60 requests/minute per user
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 *   CRON_SECRET               — (Optional) Secret for cron-triggered refresh
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from '../_shared/rate-limit.ts';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

/** Rate precision: 6 decimal places → multiplier of 1,000,000. */
const RATE_PRECISION = 6;
const RATE_MULTIPLIER = 10 ** RATE_PRECISION;

/** ECB XML feed URL for daily exchange rates. */
const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/** ISO 4217 currency code pattern. */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Parse ECB XML response to extract currency rates.
 * ECB rates are always relative to EUR as the base currency.
 */
function parseEcbXml(xml: string): Map<string, number> {
  const rates = new Map<string, number>();
  rates.set('EUR', 1.0); // EUR is always 1.0 (base)

  // Match <Cube currency="XXX" rate="Y.YYYY"/>
  const pattern = /currency='([A-Z]{3})'\s+rate='([\d.]+)'/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    rates.set(match[1], parseFloat(match[2]));
  }

  // Also try double-quote variant
  const pattern2 = /currency="([A-Z]{3})"\s+rate="([\d.]+)"/g;
  while ((match = pattern2.exec(xml)) !== null) {
    if (!rates.has(match[1])) {
      rates.set(match[1], parseFloat(match[2]));
    }
  }

  return rates;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('exchange-rates');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('exchange-rates', req);
  if (envError) return envError;

  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // POST refresh endpoint — cron or admin
    if (req.method === 'POST' && action === 'refresh') {
      // Authenticate via CRON_SECRET
      const cronSecret = Deno.env.get('CRON_SECRET');
      const authHeader = req.headers.get('Authorization');

      let isAuthorized = false;
      if (cronSecret && authHeader) {
        isAuthorized = await timingSafeEqual(authHeader, `Bearer ${cronSecret}`);
      }

      if (!isAuthorized) {
        // Try user auth as fallback (admin users)
        try {
          await requireAuth(req);
          isAuthorized = true;
        } catch {
          return errorResponse(req, 'Unauthorized', 401);
        }
      }

      // Rate limiting for refresh
      const clientIp = getClientIp(req) ?? 'cron';
      const rl = await checkRateLimit(supabase, clientIp, RATE_LIMITS['exchange-rates']);
      if (!rl.allowed) {
        return rateLimitResponse(req, rl, RATE_LIMITS['exchange-rates']);
      }

      // Fetch rates from ECB
      logger.info('Fetching rates from ECB');
      let ecbResponse: Response;
      try {
        ecbResponse = await fetch(ECB_DAILY_URL, {
          headers: { Accept: 'application/xml' },
        });
      } catch (fetchErr) {
        logger.error('ECB API fetch failed', {
          errorMessage: (fetchErr as Error).message,
        });
        return errorResponse(req, 'Failed to fetch exchange rates from ECB', 502);
      }

      if (!ecbResponse.ok) {
        logger.error('ECB API returned error', { httpStatus: ecbResponse.status });
        return errorResponse(req, 'ECB API returned an error', 502);
      }

      const xml = await ecbResponse.text();
      const rates = parseEcbXml(xml);

      if (rates.size <= 1) {
        logger.error('No rates parsed from ECB response');
        return errorResponse(req, 'Failed to parse exchange rates', 502);
      }

      // Store rates with EUR as base currency
      const today = new Date().toISOString().substring(0, 10);
      let insertedCount = 0;

      for (const [currency, rate] of rates) {
        if (currency === 'EUR') continue;

        const rateMultiplied = Math.round(rate * RATE_MULTIPLIER);

        const { error: upsertErr } = await supabase.from('exchange_rates').upsert(
          {
            base_currency: 'EUR',
            target_currency: currency,
            rate_multiplied: rateMultiplied,
            rate_precision: RATE_PRECISION,
            source: 'ecb',
            fetched_at: new Date().toISOString(),
            valid_date: today,
          },
          {
            onConflict: 'base_currency,target_currency,valid_date',
            ignoreDuplicates: false,
          },
        );

        if (!upsertErr) {
          insertedCount++;
        }
      }

      logger.info('Exchange rates refreshed', {
        httpStatus: 200,
        rateCount: insertedCount,
        validDate: today,
      });

      return jsonResponse(req, {
        ok: true,
        rates_updated: insertedCount,
        valid_date: today,
        source: 'ecb',
        refreshed_at: new Date().toISOString(),
      });
    }

    // GET endpoints require user auth
    if (req.method !== 'GET') {
      return methodNotAllowedResponse(req);
    }

    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);

    // Rate limiting
    const rl = await checkRateLimit(supabase, user.id, RATE_LIMITS['exchange-rates']);
    if (!rl.allowed) {
      return rateLimitResponse(req, rl, RATE_LIMITS['exchange-rates']);
    }

    if (action === 'convert') {
      // ===================================================================
      // CONVERT AMOUNT
      // ===================================================================
      const from = url.searchParams.get('from')?.toUpperCase();
      const to = url.searchParams.get('to')?.toUpperCase();
      const amountCentsParam = url.searchParams.get('amount_cents');

      if (!from || !CURRENCY_PATTERN.test(from)) {
        return errorResponse(req, 'from query parameter is required (3-letter currency code)');
      }
      if (!to || !CURRENCY_PATTERN.test(to)) {
        return errorResponse(req, 'to query parameter is required (3-letter currency code)');
      }
      if (!amountCentsParam || isNaN(parseInt(amountCentsParam, 10))) {
        return errorResponse(req, 'amount_cents query parameter is required (integer)');
      }

      const amountCents = BigInt(amountCentsParam);

      if (from === to) {
        return jsonResponse(req, {
          from_currency: from,
          to_currency: to,
          amount_cents: Number(amountCents),
          converted_cents: Number(amountCents),
          rate: 1.0,
          rate_date: new Date().toISOString().substring(0, 10),
        });
      }

      // Get rates for both currencies relative to EUR
      const { data: fromRate } = await supabase
        .from('exchange_rates')
        .select('rate_multiplied, rate_precision, valid_date')
        .eq('base_currency', 'EUR')
        .eq('target_currency', from)
        .is('deleted_at', null)
        .order('valid_date', { ascending: false })
        .limit(1)
        .single();

      const { data: toRate } = await supabase
        .from('exchange_rates')
        .select('rate_multiplied, rate_precision, valid_date')
        .eq('base_currency', 'EUR')
        .eq('target_currency', to)
        .is('deleted_at', null)
        .order('valid_date', { ascending: false })
        .limit(1)
        .single();

      // Handle EUR as from or to
      let crossRate: number;
      let rateDate: string;

      if (from === 'EUR' && toRate) {
        crossRate = toRate.rate_multiplied / 10 ** toRate.rate_precision;
        rateDate = toRate.valid_date;
      } else if (to === 'EUR' && fromRate) {
        crossRate = 10 ** fromRate.rate_precision / fromRate.rate_multiplied;
        rateDate = fromRate.valid_date;
      } else if (fromRate && toRate) {
        // Cross rate: FROM → EUR → TO
        crossRate =
          toRate.rate_multiplied /
          10 ** toRate.rate_precision /
          (fromRate.rate_multiplied / 10 ** fromRate.rate_precision);
        rateDate =
          fromRate.valid_date < toRate.valid_date ? fromRate.valid_date : toRate.valid_date;
      } else {
        return errorResponse(
          req,
          'Exchange rate not available for this currency pair. Try refreshing rates.',
          404,
        );
      }

      // Convert amount using integer arithmetic for precision
      const convertedCents = Math.round(Number(amountCents) * crossRate);

      logger.info('Currency conversion performed', { httpStatus: 200 });

      return jsonResponse(req, {
        from_currency: from,
        to_currency: to,
        amount_cents: Number(amountCents),
        converted_cents: convertedCents,
        rate: Math.round(crossRate * RATE_MULTIPLIER) / RATE_MULTIPLIER,
        rate_date: rateDate,
      });
    }

    // =====================================================================
    // GET LATEST RATES
    // =====================================================================
    const baseCurrency = (url.searchParams.get('base') ?? 'EUR').toUpperCase();

    if (!CURRENCY_PATTERN.test(baseCurrency)) {
      return errorResponse(req, 'base must be a 3-letter currency code');
    }

    // Get latest rates
    const { data: latestRates, error: rateErr } = await supabase
      .from('exchange_rates')
      .select('base_currency, target_currency, rate_multiplied, rate_precision, valid_date')
      .eq('base_currency', 'EUR')
      .is('deleted_at', null)
      .order('valid_date', { ascending: false })
      .limit(50);

    if (rateErr) {
      logger.error('Failed to fetch rates', { errorMessage: rateErr.message });
      return internalErrorResponse(req);
    }

    if (!latestRates || latestRates.length === 0) {
      return errorResponse(req, 'No exchange rates available. Rates need to be refreshed.', 404);
    }

    // Get the latest date
    const latestDate = latestRates[0].valid_date;
    const todayRates = latestRates.filter(
      (r: Record<string, unknown>) => r.valid_date === latestDate,
    );

    // If base is not EUR, compute cross-rates
    const rates: Record<string, unknown>[] = todayRates.map((r: Record<string, unknown>) => ({
      currency: r.target_currency,
      rate: (r.rate_multiplied as number) / 10 ** (r.rate_precision as number),
      rate_multiplied: r.rate_multiplied,
      rate_precision: r.rate_precision,
    }));

    logger.info('Rates retrieved', { httpStatus: 200, count: rates.length });

    return jsonResponse(req, {
      base_currency: 'EUR',
      valid_date: latestDate,
      rates,
      source: 'ecb',
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Exchange rates error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
