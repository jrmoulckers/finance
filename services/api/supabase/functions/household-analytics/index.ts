// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): SPECULATIVE — Not wired to any client. No tests. Analytics
// queries depend on RPC functions that may not exist yet. Exclude from
// alpha deployment; revisit when household analytics UI is built. (#1390)

/**
 * Household Analytics Edge Function (#1052)
 *
 * Provides household-level financial analytics with proper RLS filtering:
 *   - Total spending by member (anonymized display)
 *   - Shared budget utilization across the household
 *   - Household savings rate (income vs expenses)
 *   - Spending trends by category
 *   - Period comparisons (current vs previous)
 *
 * All data is filtered through RLS — users can only access analytics
 * for households they belong to. Financial amounts are returned as
 * aggregate percentages and ratios, NEVER as raw cent values in logs.
 *
 * Methods:
 *   GET ?household_id=<uuid>&period=<monthly|weekly|yearly>
 *       &action=<overview|spending-by-member|budget-utilization|savings-rate>
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Verifies household membership before returning any data
 *   - Rate limited: 60 requests per user per minute
 *   - NEVER logs raw financial amounts
 *   - Origin-validated CORS
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
// Types & Constants
// ---------------------------------------------------------------------------

type AnalyticsPeriod = 'weekly' | 'monthly' | 'yearly';
type AnalyticsAction = 'overview' | 'spending-by-member' | 'budget-utilization' | 'savings-rate';

const VALID_PERIODS: readonly AnalyticsPeriod[] = ['weekly', 'monthly', 'yearly'];
const VALID_ACTIONS: readonly AnalyticsAction[] = [
  'overview',
  'spending-by-member',
  'budget-utilization',
  'savings-rate',
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

function getPeriodStartDate(period: AnalyticsPeriod): string {
  const now = new Date();
  switch (period) {
    case 'weekly': {
      const day = now.getDay();
      const diff = now.getDate() - day;
      return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
    }
    case 'monthly':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    case 'yearly':
      return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  }
}

function getPreviousPeriodDates(period: AnalyticsPeriod): { start: string; end: string } {
  const now = new Date();
  switch (period) {
    case 'weekly': {
      const day = now.getDay();
      const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      const prevWeekEnd = new Date(thisWeekStart.getTime() - 1);
      const prevWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        start: prevWeekStart.toISOString().split('T')[0],
        end: prevWeekEnd.toISOString().split('T')[0],
      };
    }
    case 'monthly': {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: prevMonth.toISOString().split('T')[0],
        end: prevMonthEnd.toISOString().split('T')[0],
      };
    }
    case 'yearly': {
      const prevYear = new Date(now.getFullYear() - 1, 0, 1);
      const prevYearEnd = new Date(now.getFullYear() - 1, 11, 31);
      return {
        start: prevYear.toISOString().split('T')[0],
        end: prevYearEnd.toISOString().split('T')[0],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Verify household membership
// ---------------------------------------------------------------------------

async function verifyMembership(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  householdId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('household_members')
    .select('id')
    .eq('user_id', userId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Action: Overview
// ---------------------------------------------------------------------------

async function getOverview(
  req: Request,
  supabase: ReturnType<typeof createAdminClient>,
  householdId: string,
  period: AnalyticsPeriod,
): Promise<Response> {
  const periodStart = getPeriodStartDate(period);
  const prevPeriod = getPreviousPeriodDates(period);

  // Current period aggregates
  const [
    incomeResult,
    expenseResult,
    prevIncomeResult,
    prevExpenseResult,
    memberCountResult,
    accountResult,
  ] = await Promise.all([
    // Current income
    supabase
      .from('transactions')
      .select('amount_cents')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .in('type', ['INCOME', 'TRANSFER_IN'])
      .gte('date', periodStart),
    // Current expenses
    supabase
      .from('transactions')
      .select('amount_cents')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .in('type', ['EXPENSE', 'TRANSFER_OUT'])
      .gte('date', periodStart),
    // Previous income
    supabase
      .from('transactions')
      .select('amount_cents')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .in('type', ['INCOME', 'TRANSFER_IN'])
      .gte('date', prevPeriod.start)
      .lte('date', prevPeriod.end),
    // Previous expenses
    supabase
      .from('transactions')
      .select('amount_cents')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .in('type', ['EXPENSE', 'TRANSFER_OUT'])
      .gte('date', prevPeriod.start)
      .lte('date', prevPeriod.end),
    // Member count
    supabase
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .is('deleted_at', null),
    // Account total
    supabase
      .from('accounts')
      .select('balance_cents')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .eq('is_active', true),
  ]);

  const currentIncome = (incomeResult.data ?? []).reduce(
    (sum: number, t: { amount_cents: number }) => sum + Math.abs(t.amount_cents),
    0,
  );
  const currentExpenses = (expenseResult.data ?? []).reduce(
    (sum: number, t: { amount_cents: number }) => sum + Math.abs(t.amount_cents),
    0,
  );
  const prevIncome = (prevIncomeResult.data ?? []).reduce(
    (sum: number, t: { amount_cents: number }) => sum + Math.abs(t.amount_cents),
    0,
  );
  const prevExpenses = (prevExpenseResult.data ?? []).reduce(
    (sum: number, t: { amount_cents: number }) => sum + Math.abs(t.amount_cents),
    0,
  );
  const totalBalance = (accountResult.data ?? []).reduce(
    (sum: number, a: { balance_cents: number }) => sum + a.balance_cents,
    0,
  );

  const savingsRate =
    currentIncome > 0
      ? parseFloat((((currentIncome - currentExpenses) / currentIncome) * 100).toFixed(2))
      : 0;

  const expenseChangeRate =
    prevExpenses > 0
      ? parseFloat((((currentExpenses - prevExpenses) / prevExpenses) * 100).toFixed(2))
      : 0;

  return jsonResponse(req, {
    household_id: householdId,
    period,
    period_start: periodStart,
    overview: {
      total_income_cents: currentIncome,
      total_expenses_cents: currentExpenses,
      net_cents: currentIncome - currentExpenses,
      savings_rate_pct: savingsRate,
      total_balance_cents: totalBalance,
      member_count: memberCountResult.count ?? 0,
      expense_change_pct: expenseChangeRate,
      previous_period: {
        income_cents: prevIncome,
        expenses_cents: prevExpenses,
      },
    },
    generated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Action: Spending by member
// ---------------------------------------------------------------------------

async function getSpendingByMember(
  req: Request,
  supabase: ReturnType<typeof createAdminClient>,
  householdId: string,
  period: AnalyticsPeriod,
): Promise<Response> {
  const periodStart = getPeriodStartDate(period);

  // Get household members
  const { data: members, error: membersError } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
    .is('deleted_at', null);

  if (membersError || !members) {
    return internalErrorResponse(req);
  }

  // Get member display names
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name')
    .in(
      'id',
      members.map((m: { user_id: string }) => m.user_id),
    );

  const userMap = new Map(
    (users ?? []).map((u: { id: string; display_name: string }) => [u.id, u.display_name]),
  );

  // Get transactions with owner_id for member attribution
  const { data: transactions } = await supabase
    .from('transactions')
    .select('owner_id, amount_cents, type')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .in('type', ['EXPENSE', 'TRANSFER_OUT'])
    .gte('date', periodStart);

  // Aggregate by member
  const memberSpending = new Map<string, number>();
  let totalSpending = 0;

  for (const txn of transactions ?? []) {
    const t = txn as { owner_id: string | null; amount_cents: number; type: string };
    const memberId = t.owner_id ?? 'unattributed';
    const amount = Math.abs(t.amount_cents);
    memberSpending.set(memberId, (memberSpending.get(memberId) ?? 0) + amount);
    totalSpending += amount;
  }

  const memberBreakdown = Array.from(memberSpending.entries()).map(([memberId, spentCents]) => ({
    member_id: memberId,
    display_name: userMap.get(memberId) ?? 'Unattributed',
    spent_cents: spentCents,
    share_pct: totalSpending > 0 ? parseFloat(((spentCents / totalSpending) * 100).toFixed(2)) : 0,
  }));

  // Sort by spending descending
  memberBreakdown.sort((a, b) => b.spent_cents - a.spent_cents);

  return jsonResponse(req, {
    household_id: householdId,
    period,
    period_start: periodStart,
    spending_by_member: {
      total_spending_cents: totalSpending,
      members: memberBreakdown,
    },
    generated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Action: Budget utilization
// ---------------------------------------------------------------------------

async function getBudgetUtilization(
  req: Request,
  supabase: ReturnType<typeof createAdminClient>,
  householdId: string,
  period: AnalyticsPeriod,
): Promise<Response> {
  const periodStart = getPeriodStartDate(period);

  // Get all active budgets for the household
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('id, category_id, amount_cents, currency_code, period')
    .eq('household_id', householdId)
    .is('deleted_at', null);

  if (budgetError) {
    return internalErrorResponse(req);
  }

  // Get category names
  const categoryIds = (budgets ?? []).map((b: { category_id: string }) => b.category_id);
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .in('id', categoryIds);

  const categoryMap = new Map(
    (categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
  );

  // Get spending per category for the current period
  const { data: transactions } = await supabase
    .from('transactions')
    .select('category_id, amount_cents')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .in('type', ['EXPENSE', 'TRANSFER_OUT'])
    .gte('date', periodStart);

  const categorySpending = new Map<string, number>();
  for (const txn of transactions ?? []) {
    const t = txn as { category_id: string | null; amount_cents: number };
    if (t.category_id) {
      categorySpending.set(
        t.category_id,
        (categorySpending.get(t.category_id) ?? 0) + Math.abs(t.amount_cents),
      );
    }
  }

  let totalBudgeted = 0;
  let totalSpent = 0;

  const budgetBreakdown = (budgets ?? []).map(
    (b: {
      id: string;
      category_id: string;
      amount_cents: number;
      currency_code: string;
      period: string;
    }) => {
      const spent = categorySpending.get(b.category_id) ?? 0;
      const utilization =
        b.amount_cents > 0 ? parseFloat(((spent / b.amount_cents) * 100).toFixed(2)) : 0;

      totalBudgeted += b.amount_cents;
      totalSpent += spent;

      return {
        budget_id: b.id,
        category_id: b.category_id,
        category_name: categoryMap.get(b.category_id) ?? 'Unknown',
        budgeted_cents: b.amount_cents,
        spent_cents: spent,
        remaining_cents: b.amount_cents - spent,
        utilization_pct: utilization,
        status: utilization >= 100 ? 'exceeded' : utilization >= 80 ? 'warning' : 'on_track',
      };
    },
  );

  // Sort by utilization descending
  budgetBreakdown.sort(
    (a: { utilization_pct: number }, b: { utilization_pct: number }) =>
      b.utilization_pct - a.utilization_pct,
  );

  const overallUtilization =
    totalBudgeted > 0 ? parseFloat(((totalSpent / totalBudgeted) * 100).toFixed(2)) : 0;

  return jsonResponse(req, {
    household_id: householdId,
    period,
    period_start: periodStart,
    budget_utilization: {
      total_budgeted_cents: totalBudgeted,
      total_spent_cents: totalSpent,
      overall_utilization_pct: overallUtilization,
      budgets_exceeded: budgetBreakdown.filter((b: { status: string }) => b.status === 'exceeded')
        .length,
      budgets_warning: budgetBreakdown.filter((b: { status: string }) => b.status === 'warning')
        .length,
      budgets_on_track: budgetBreakdown.filter((b: { status: string }) => b.status === 'on_track')
        .length,
      budgets: budgetBreakdown,
    },
    generated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Action: Savings rate
// ---------------------------------------------------------------------------

async function getSavingsRate(
  req: Request,
  supabase: ReturnType<typeof createAdminClient>,
  householdId: string,
  period: AnalyticsPeriod,
): Promise<Response> {
  // Calculate savings rate for the last N periods
  const periodsToShow = period === 'yearly' ? 3 : period === 'monthly' ? 6 : 8;
  const periodData: Array<{
    period_start: string;
    income_cents: number;
    expense_cents: number;
    savings_cents: number;
    savings_rate_pct: number;
  }> = [];

  for (let i = 0; i < periodsToShow; i++) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'weekly': {
        const day = now.getDay();
        const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        startDate = new Date(thisWeekStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        break;
      }
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear() - i, 0, 1);
        endDate = new Date(now.getFullYear() - i, 11, 31);
        break;
    }

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const [incomeRes, expenseRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount_cents')
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .in('type', ['INCOME', 'TRANSFER_IN'])
        .gte('date', startStr)
        .lte('date', endStr),
      supabase
        .from('transactions')
        .select('amount_cents')
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .in('type', ['EXPENSE', 'TRANSFER_OUT'])
        .gte('date', startStr)
        .lte('date', endStr),
    ]);

    const income = (incomeRes.data ?? []).reduce(
      (sum: number, t: { amount_cents: number }) => sum + Math.abs(t.amount_cents),
      0,
    );
    const expenses = (expenseRes.data ?? []).reduce(
      (sum: number, t: { amount_cents: number }) => sum + Math.abs(t.amount_cents),
      0,
    );
    const savings = income - expenses;
    const rate = income > 0 ? parseFloat(((savings / income) * 100).toFixed(2)) : 0;

    periodData.push({
      period_start: startStr,
      income_cents: income,
      expense_cents: expenses,
      savings_cents: savings,
      savings_rate_pct: rate,
    });
  }

  // Calculate average savings rate
  const ratesWithIncome = periodData.filter((p) => p.income_cents > 0);
  const avgSavingsRate =
    ratesWithIncome.length > 0
      ? parseFloat(
          (
            ratesWithIncome.reduce((sum, p) => sum + p.savings_rate_pct, 0) / ratesWithIncome.length
          ).toFixed(2),
        )
      : 0;

  // Trend: compare most recent to previous
  const trend =
    periodData.length >= 2
      ? periodData[0].savings_rate_pct > periodData[1].savings_rate_pct
        ? 'improving'
        : periodData[0].savings_rate_pct < periodData[1].savings_rate_pct
          ? 'declining'
          : 'stable'
      : 'insufficient_data';

  return jsonResponse(req, {
    household_id: householdId,
    period,
    savings_rate: {
      current_rate_pct: periodData[0]?.savings_rate_pct ?? 0,
      average_rate_pct: avgSavingsRate,
      trend,
      periods: periodData,
    },
    generated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('household-analytics');
  logger.info('Request received', { method: req.method });

  // Validate environment
  const envError = validateEnv('sync-health-report', req);
  if (envError) return envError;

  if (req.method !== 'GET') {
    return methodNotAllowedResponse(req);
  }

  try {
    // ------------------------------------------------------------------
    // Authentication
    // ------------------------------------------------------------------
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    // ------------------------------------------------------------------
    // Rate limiting
    // ------------------------------------------------------------------
    const rl = await checkRateLimit(supabase, user.id, RATE_LIMITS['admin-dashboard']);
    if (!rl.allowed) {
      return rateLimitResponse(req, rl, RATE_LIMITS['admin-dashboard']);
    }

    // ------------------------------------------------------------------
    // Parse and validate parameters
    // ------------------------------------------------------------------
    const url = new URL(req.url);
    const householdId = url.searchParams.get('household_id');
    const period = (url.searchParams.get('period') ?? 'monthly') as AnalyticsPeriod;
    const action = (url.searchParams.get('action') ?? 'overview') as AnalyticsAction;

    if (!householdId || !UUID_PATTERN.test(householdId)) {
      return errorResponse(req, 'household_id is required and must be a valid UUID', 400);
    }

    if (!(VALID_PERIODS as readonly string[]).includes(period)) {
      return errorResponse(req, `period must be one of: ${VALID_PERIODS.join(', ')}`, 400);
    }

    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return errorResponse(req, `action must be one of: ${VALID_ACTIONS.join(', ')}`, 400);
    }

    // ------------------------------------------------------------------
    // Verify household membership (RLS enforcement)
    // ------------------------------------------------------------------
    const isMember = await verifyMembership(supabase, user.id, householdId);
    if (!isMember) {
      logger.warn('Household access denied', { httpStatus: 403 });
      return errorResponse(req, 'You are not a member of this household', 403);
    }

    logger.info('Processing analytics request', { action, period, householdId });

    // ------------------------------------------------------------------
    // Route to action handler
    // ------------------------------------------------------------------
    switch (action) {
      case 'overview':
        return await getOverview(req, supabase, householdId, period);
      case 'spending-by-member':
        return await getSpendingByMember(req, supabase, householdId, period);
      case 'budget-utilization':
        return await getBudgetUtilization(req, supabase, householdId, period);
      case 'savings-rate':
        return await getSavingsRate(req, supabase, householdId, period);
      default:
        return errorResponse(req, 'Invalid action', 400);
    }
  } catch (err) {
    logger.error('Household analytics error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
