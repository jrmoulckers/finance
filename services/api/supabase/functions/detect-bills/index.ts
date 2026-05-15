// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): SPECULATIVE — Not wired to any client. Has tests but no UI
// integration. Bill detection is a post-alpha feature. Exclude from alpha
// deployment. (#1390)

/**
 * Bill Detection Engine Edge Function (#sprint-10)
 *
 * Analyzes transaction patterns to detect recurring bills:
 *   POST /detect-bills?action=analyze — Run bill detection for a household
 *   GET  /detect-bills                — List detected bills for a household
 *   PUT  /detect-bills                — Confirm or dismiss a detected bill
 *
 * Detection Algorithm:
 *   1. Group transactions by payee/merchant (case-insensitive)
 *   2. For each merchant with 3+ transactions:
 *      a. Calculate amount mean and standard deviation
 *      b. Detect interval regularity (weekly, biweekly, monthly, etc.)
 *      c. Score confidence based on:
 *         - Amount consistency (low variance = higher score)
 *         - Interval regularity (consistent gaps = higher score)
 *         - Transaction count (more occurrences = higher score)
 *   3. Bills with confidence >= 50 are stored as detected
 *   4. Predict next expected date from latest transaction + interval
 *
 * Security:
 *   - Requires authentication (Bearer JWT)
 *   - Rate-limited: 10 requests/minute per user (analysis is expensive)
 *   - All data queries go through RLS (household isolation)
 *   - Monetary amounts returned as integer cents — never floats
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
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

// ---------------------------------------------------------------------------
// Detection Constants
// ---------------------------------------------------------------------------

/** Minimum number of transactions from the same merchant to consider. */
const MIN_TRANSACTIONS = 3;

/** Minimum confidence score to create a detected bill. */
const MIN_CONFIDENCE = 50;

/** Lookback period in days for transaction analysis. */
const LOOKBACK_DAYS = 365;

/** Interval detection thresholds in days. */
const FREQUENCY_RANGES: { name: string; minDays: number; maxDays: number; targetDays: number }[] = [
  { name: 'weekly', minDays: 5, maxDays: 9, targetDays: 7 },
  { name: 'biweekly', minDays: 12, maxDays: 17, targetDays: 14 },
  { name: 'monthly', minDays: 25, maxDays: 35, targetDays: 30 },
  { name: 'quarterly', minDays: 80, maxDays: 100, targetDays: 91 },
  { name: 'yearly', minDays: 350, maxDays: 380, targetDays: 365 },
];

// ---------------------------------------------------------------------------
// Subscription Category Detection
// ---------------------------------------------------------------------------

/**
 * Known subscription/bill category keywords for automatic categorization.
 * Merchant names are matched case-insensitively against these patterns.
 */
export const SUBSCRIPTION_CATEGORIES: {
  category: string;
  keywords: string[];
}[] = [
  {
    category: 'streaming',
    keywords: [
      'netflix',
      'hulu',
      'disney',
      'hbo',
      'paramount',
      'peacock',
      'apple tv',
      'spotify',
      'youtube',
      'amazon prime',
      'crunchyroll',
      'dazn',
      'audible',
    ],
  },
  {
    category: 'saas',
    keywords: [
      'adobe',
      'microsoft',
      'google workspace',
      'slack',
      'zoom',
      'notion',
      'dropbox',
      'github',
      'atlassian',
      'figma',
      'canva',
      'openai',
      'chatgpt',
    ],
  },
  {
    category: 'insurance',
    keywords: [
      'insurance',
      'allstate',
      'geico',
      'progressive',
      'state farm',
      'liberty mutual',
      'usaa',
      'aetna',
      'cigna',
      'humana',
      'anthem',
    ],
  },
  {
    category: 'utilities',
    keywords: [
      'electric',
      'gas',
      'water',
      'sewage',
      'trash',
      'waste',
      'power',
      'energy',
      'utility',
      'comcast',
      'xfinity',
      'att',
      'verizon',
      't-mobile',
      'sprint',
      'internet',
      'broadband',
      'spectrum',
    ],
  },
  {
    category: 'fitness',
    keywords: [
      'gym',
      'fitness',
      'planet fitness',
      'anytime fitness',
      'la fitness',
      'peloton',
      'crossfit',
      'yoga',
      'equinox',
      'orangetheory',
    ],
  },
  {
    category: 'news_media',
    keywords: [
      'new york times',
      'washington post',
      'wsj',
      'wall street journal',
      'medium',
      'substack',
      'economist',
      'bbc',
      'cnn',
      'reuters',
    ],
  },
  {
    category: 'cloud_storage',
    keywords: ['icloud', 'google one', 'onedrive', 'backblaze', 'idrive'],
  },
  {
    category: 'rent_mortgage',
    keywords: ['rent', 'mortgage', 'apartment', 'housing', 'lease', 'landlord'],
  },
];

/**
 * Detect subscription category from merchant name.
 *
 * @param merchant The merchant/payee name.
 * @returns Detected category or 'other' if no match.
 */
export function detectSubscriptionCategory(merchant: string): string {
  const lower = merchant.toLowerCase();
  for (const { category, keywords } of SUBSCRIPTION_CATEGORIES) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }
  return 'other';
}

/**
 * Map confidence score to a human-readable level.
 *
 * @param score Numeric confidence (0-100).
 * @returns 'high' (80+), 'medium' (60-79), or 'low' (below 60).
 */
export function confidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Detection Helpers
// ---------------------------------------------------------------------------

/** Calculate the mean of an array of numbers. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Calculate standard deviation. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const sqDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/** Detect frequency from an array of intervals (in days). */
function detectFrequency(intervals: number[]): { name: string; targetDays: number } | null {
  if (intervals.length === 0) return null;
  const avgInterval = mean(intervals);

  for (const freq of FREQUENCY_RANGES) {
    if (avgInterval >= freq.minDays && avgInterval <= freq.maxDays) {
      return { name: freq.name, targetDays: freq.targetDays };
    }
  }
  return null;
}

/** Calculate confidence score (0-100). */
function calculateConfidence(
  transactionCount: number,
  amountStdDev: number,
  amountMean: number,
  intervalStdDev: number,
  intervalMean: number,
): number {
  let score = 0;

  // Transaction count factor (more = more confident, up to 30 points)
  score += Math.min(transactionCount * 5, 30);

  // Amount consistency factor (low variance = higher score, up to 40 points)
  if (amountMean > 0) {
    const coeffOfVariation = amountStdDev / amountMean;
    if (coeffOfVariation < 0.05)
      score += 40; // < 5% variation
    else if (coeffOfVariation < 0.1) score += 30;
    else if (coeffOfVariation < 0.2) score += 20;
    else if (coeffOfVariation < 0.5) score += 10;
  }

  // Interval regularity factor (up to 30 points)
  if (intervalMean > 0) {
    const intervalCv = intervalStdDev / intervalMean;
    if (intervalCv < 0.1)
      score += 30; // Very regular
    else if (intervalCv < 0.2) score += 20;
    else if (intervalCv < 0.3) score += 15;
    else if (intervalCv < 0.5) score += 5;
  }

  return Math.min(score, 100);
}

/** Add days to a date string (YYYY-MM-DD). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

/** Calculate days between two date strings. */
function daysBetween(d1: string, d2: string): number {
  const date1 = new Date(d1 + 'T00:00:00Z');
  const date2 = new Date(d2 + 'T00:00:00Z');
  return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

/** Safe columns to return for detected bills. */
const SAFE_COLUMNS =
  'id, household_id, merchant, estimated_amount_cents, currency_code, frequency, confidence_score, last_transaction_date, next_expected_date, transaction_count, avg_amount_cents, amount_variance_cents, status, category_id, account_id, subscription_category, created_at, updated_at';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('detect-bills');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('detect-bills', req);
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

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['detect-bills']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['detect-bills']);
    }

    const url = new URL(req.url);
    const householdId = url.searchParams.get('household_id');
    const actionParam = url.searchParams.get('action');

    if (req.method === 'GET') {
      if (!householdId) {
        return errorResponse(req, 'household_id query parameter is required');
      }

      if (actionParam === 'calendar') {
        // =================================================================
        // BILL CALENDAR — next 30 days of expected bills
        // =================================================================
        const daysAhead = parseInt(url.searchParams.get('days') ?? '30', 10);
        const today = new Date().toISOString().substring(0, 10);
        const endDate = addDays(today, Math.min(daysAhead, 90));

        const { data: upcomingBills, error: calErr } = await supabase
          .from('detected_bills')
          .select(SAFE_COLUMNS)
          .eq('household_id', householdId)
          .in('status', ['detected', 'confirmed'])
          .gte('next_expected_date', today)
          .lte('next_expected_date', endDate)
          .is('deleted_at', null)
          .order('next_expected_date', { ascending: true });

        if (calErr) {
          logger.error('Failed to fetch bill calendar', { errorMessage: calErr.message });
          return internalErrorResponse(req);
        }

        // Enrich with confidence level and subscription category
        const enrichedBills = (upcomingBills ?? []).map((bill: Record<string, unknown>) => ({
          ...bill,
          confidence_level: confidenceLevel(bill.confidence_score as number),
          subscription_category:
            (bill.subscription_category as string) ??
            detectSubscriptionCategory(bill.merchant as string),
        }));

        // Aggregate totals
        let totalEstimatedCents = BigInt(0);
        for (const bill of enrichedBills) {
          totalEstimatedCents += BigInt(bill.estimated_amount_cents as number);
        }

        logger.info('Bill calendar fetched', {
          httpStatus: 200,
          count: enrichedBills.length,
          daysAhead,
        });

        return jsonResponse(req, {
          calendar: {
            from_date: today,
            to_date: endDate,
            days: daysAhead,
            bills: enrichedBills,
            total_bills: enrichedBills.length,
            total_estimated_cents: Number(totalEstimatedCents),
            currency_code:
              enrichedBills.length > 0 ? (enrichedBills[0].currency_code as string) : 'USD',
          },
        });
      }

      // ===================================================================
      // LIST DETECTED BILLS (with enrichment)
      // ===================================================================
      const statusFilter = url.searchParams.get('status');
      let query = supabase
        .from('detected_bills')
        .select(SAFE_COLUMNS)
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('confidence_score', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data: bills, error: listErr } = await query;

      if (listErr) {
        logger.error('Failed to list detected bills', { errorMessage: listErr.message });
        return internalErrorResponse(req);
      }

      // Enrich with confidence level and subscription category
      const enrichedBills = (bills ?? []).map((bill: Record<string, unknown>) => ({
        ...bill,
        confidence_level: confidenceLevel(bill.confidence_score as number),
        subscription_category:
          (bill.subscription_category as string) ??
          detectSubscriptionCategory(bill.merchant as string),
      }));

      logger.info('Detected bills listed', { httpStatus: 200, count: enrichedBills.length });
      return jsonResponse(req, { detected_bills: enrichedBills });
    }

    if (req.method === 'PUT') {
      // ===================================================================
      // CONFIRM OR DISMISS A DETECTED BILL
      // ===================================================================
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse(req, 'Invalid JSON body');
      }

      const { bill_id, action } = body as { bill_id?: string; action?: string };

      if (!bill_id) {
        return errorResponse(req, 'bill_id is required');
      }
      if (!action || !['confirm', 'dismiss'].includes(action)) {
        return errorResponse(req, 'action must be "confirm" or "dismiss"');
      }

      const newStatus = action === 'confirm' ? 'confirmed' : 'dismissed';

      const { data: updated, error: updateErr } = await supabase
        .from('detected_bills')
        .update({ status: newStatus })
        .eq('id', bill_id)
        .is('deleted_at', null)
        .select(SAFE_COLUMNS)
        .single();

      if (updateErr) {
        logger.error('Failed to update bill status', { errorMessage: updateErr.message });
        return internalErrorResponse(req);
      }

      if (!updated) {
        return errorResponse(req, 'Detected bill not found', 404);
      }

      logger.info('Bill status updated', { httpStatus: 200, newStatus });
      return jsonResponse(req, { detected_bill: updated });
    }

    if (req.method !== 'POST') {
      return methodNotAllowedResponse(req);
    }

    // =====================================================================
    // ANALYZE TRANSACTIONS FOR RECURRING BILLS
    // =====================================================================
    // Reuse actionParam parsed earlier (query param)
    if (actionParam !== 'analyze') {
      return errorResponse(req, 'POST requires action=analyze query parameter');
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON body');
    }

    const { household_id: bodyHouseholdId } = body as { household_id?: string };

    if (!bodyHouseholdId) {
      return errorResponse(req, 'household_id is required');
    }

    // Verify membership
    const { data: membership } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', bodyHouseholdId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      return errorResponse(req, 'You are not a member of this household', 403);
    }

    // Fetch transactions from the lookback period
    const lookbackDate = addDays(new Date().toISOString().substring(0, 10), -LOOKBACK_DAYS);

    const { data: transactions, error: txErr } = await supabase
      .from('transactions')
      .select('id, payee, amount_cents, currency_code, date, category_id, account_id')
      .eq('household_id', bodyHouseholdId)
      .eq('type', 'expense')
      .gte('date', lookbackDate)
      .is('deleted_at', null)
      .order('date', { ascending: true });

    if (txErr) {
      logger.error('Failed to fetch transactions', { errorMessage: txErr.message });
      return internalErrorResponse(req);
    }

    if (!transactions || transactions.length === 0) {
      return jsonResponse(req, {
        detected_count: 0,
        message: 'No transactions found for analysis',
      });
    }

    // Group transactions by payee (case-insensitive, trimmed)
    const merchantGroups = new Map<
      string,
      Array<{
        id: string;
        amount_cents: number;
        date: string;
        currency_code: string;
        category_id: string | null;
        account_id: string;
      }>
    >();

    for (const tx of transactions) {
      if (!tx.payee) continue;
      const key = tx.payee.trim().toLowerCase();
      if (!merchantGroups.has(key)) {
        merchantGroups.set(key, []);
      }
      merchantGroups.get(key)!.push({
        id: tx.id,
        amount_cents: tx.amount_cents,
        date: tx.date,
        currency_code: tx.currency_code,
        category_id: tx.category_id,
        account_id: tx.account_id,
      });
    }

    // Analyze each merchant group
    const detectedBills: Array<Record<string, unknown>> = [];

    for (const [merchantKey, txs] of merchantGroups) {
      if (txs.length < MIN_TRANSACTIONS) continue;

      // Sort by date
      txs.sort((a, b) => a.date.localeCompare(b.date));

      // Calculate intervals between consecutive transactions
      const intervals: number[] = [];
      for (let i = 1; i < txs.length; i++) {
        intervals.push(daysBetween(txs[i - 1].date, txs[i].date));
      }

      // Detect frequency
      const frequency = detectFrequency(intervals);
      if (!frequency) continue;

      // Amount statistics
      const amounts = txs.map((t) => Math.abs(t.amount_cents));
      const avgAmount = Math.round(mean(amounts));
      const amountStd = stdDev(amounts);

      // Interval statistics
      const intervalStd = stdDev(intervals);
      const intervalAvg = mean(intervals);

      // Calculate confidence
      const confidence = calculateConfidence(
        txs.length,
        amountStd,
        mean(amounts),
        intervalStd,
        intervalAvg,
      );

      if (confidence < MIN_CONFIDENCE) continue;

      // Use the original payee name from the most recent transaction
      const latestTx = txs[txs.length - 1];
      const originalPayee =
        transactions.find(
          (t: Record<string, unknown>) => (t.payee as string).trim().toLowerCase() === merchantKey,
        )?.payee ?? merchantKey;

      // Predict next expected date
      const nextDate = addDays(latestTx.date, frequency.targetDays);

      // Detect subscription category from merchant name
      const subscriptionCategory = detectSubscriptionCategory(originalPayee);

      detectedBills.push({
        household_id: bodyHouseholdId,
        owner_id: user.id,
        merchant: originalPayee,
        estimated_amount_cents: avgAmount,
        currency_code: latestTx.currency_code,
        frequency: frequency.name,
        confidence_score: confidence,
        last_transaction_id: latestTx.id,
        last_transaction_date: latestTx.date,
        next_expected_date: nextDate,
        transaction_count: txs.length,
        avg_amount_cents: avgAmount,
        amount_variance_cents: Math.round(amountStd),
        status: 'detected',
        category_id: latestTx.category_id,
        account_id: latestTx.account_id,
        subscription_category: subscriptionCategory,
      });
    }

    // Upsert detected bills (avoid duplicates per merchant per household)
    let insertedCount = 0;
    let updatedCount = 0;

    for (const bill of detectedBills) {
      // Check if we already have this merchant detected
      const { data: existing } = await supabase
        .from('detected_bills')
        .select('id, status')
        .eq('household_id', bodyHouseholdId)
        .ilike('merchant', bill.merchant as string)
        .is('deleted_at', null)
        .single();

      if (existing) {
        // Don't overwrite confirmed or dismissed bills
        if (existing.status === 'confirmed' || existing.status === 'dismissed') {
          continue;
        }
        // Update existing detection
        await supabase
          .from('detected_bills')
          .update({
            estimated_amount_cents: bill.estimated_amount_cents,
            frequency: bill.frequency,
            confidence_score: bill.confidence_score,
            last_transaction_id: bill.last_transaction_id,
            last_transaction_date: bill.last_transaction_date,
            next_expected_date: bill.next_expected_date,
            transaction_count: bill.transaction_count,
            avg_amount_cents: bill.avg_amount_cents,
            amount_variance_cents: bill.amount_variance_cents,
          })
          .eq('id', existing.id);
        updatedCount++;
      } else {
        const { error: insertErr } = await supabase.from('detected_bills').insert(bill);

        if (!insertErr) {
          insertedCount++;
        }
      }
    }

    // Queue notifications for newly detected high-confidence bills
    if (insertedCount > 0) {
      const highConfBills = detectedBills.filter((b) => (b.confidence_score as number) >= 80);
      if (highConfBills.length > 0) {
        const notifications = highConfBills.map((bill) => ({
          user_id: user.id,
          household_id: bodyHouseholdId,
          type: 'bill_detected',
          title: 'Recurring bill detected',
          body: `We detected a recurring ${bill.frequency} payment to ${bill.merchant}.`,
          metadata: {
            merchant: bill.merchant,
            frequency: bill.frequency,
            estimated_amount_cents: bill.estimated_amount_cents,
            confidence_score: bill.confidence_score,
            subscription_category: bill.subscription_category,
          },
        }));

        // Best-effort notification insert — don't fail the analysis if this errors
        const { error: notifErr } = await supabase.from('notifications').insert(notifications);

        if (notifErr) {
          logger.warn('Failed to queue bill detection notifications', {
            errorMessage: notifErr.message,
            billCount: notifications.length,
          });
        } else {
          logger.info('Bill detection notifications queued', {
            count: notifications.length,
          });
        }
      }
    }

    logger.info('Bill detection completed', {
      httpStatus: 200,
      analyzed: merchantGroups.size,
      detected: detectedBills.length,
      inserted: insertedCount,
      updated: updatedCount,
    });

    return jsonResponse(req, {
      merchants_analyzed: merchantGroups.size,
      bills_detected: detectedBills.length,
      bills_inserted: insertedCount,
      bills_updated: updatedCount,
      high_confidence_count: detectedBills.filter((b) => (b.confidence_score as number) >= 80)
        .length,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Bill detection error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
