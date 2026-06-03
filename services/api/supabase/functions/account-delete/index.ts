// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/account/delete-account — permanently delete the signed-in account.
 *
 * Authenticates with either the browser's HttpOnly refresh cookie or a bearer
 * token, deletes user/household data with a service-role client, deletes the
 * Supabase Auth user last, and clears the refresh cookie on success.
 */

import { validateEnv } from '../_shared/env.ts';
import {
  buildClearCookie,
  COOKIE_PKCE,
  COOKIE_POST_LOGIN,
  COOKIE_REFRESH,
  parseCookies,
} from '../_shared/cookie.ts';
import { refreshGrant } from '../_shared/supabase-auth.ts';
import { type AuthenticatedUser, createAdminClient } from '../_shared/auth.ts';

const NO_STORE_JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

interface AccountDeleteBody {
  confirmation?: unknown;
  confirm?: unknown;
}

interface HouseholdPlan {
  householdId: string;
  otherMemberUserIds: string[];
  createdBy: string | null;
}

interface AccountDeleteDeps {
  createClient?: typeof createAdminClient;
  refreshGrantFn?: typeof refreshGrant;
}

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

const HOUSEHOLD_CHILD_TABLES = [
  'connector_access_log',
  'open_banking_connections',
  'connector_permissions',
  'bank_connection_health',
  'bank_sync_log',
  'bank_connection_accounts',
  'bank_connections',
  'webhook_deliveries',
  'webhook_endpoints',
  'scheduled_reports',
  'report_configs',
  'report_templates',
  'anomaly_alerts',
  'anomaly_rules',
  'bill_reminders',
  'detected_bills',
  'import_jobs',
  'investment_holdings',
  'investment_portfolios',
  'family_plan_subscriptions',
  'notifications',
  'audit_log',
  'household_invitations',
  'recurring_transaction_templates',
  'transactions',
  'budgets',
  'goals',
  'categories',
  'accounts',
  'household_members',
] as const;

const USER_OWNED_TABLES: ReadonlyArray<readonly [table: string, column: string]> = [
  ['connector_permissions', 'owner_id'],
  ['open_banking_connections', 'owner_id'],
  ['bank_connections', 'owner_id'],
  ['webhook_endpoints', 'created_by'],
  ['scheduled_reports', 'owner_id'],
  ['report_configs', 'owner_id'],
  ['report_templates', 'owner_id'],
  ['bill_reminders', 'owner_id'],
  ['detected_bills', 'owner_id'],
  ['import_jobs', 'owner_id'],
  ['investment_holdings', 'owner_id'],
  ['investment_portfolios', 'owner_id'],
  ['family_plan_subscriptions', 'billing_owner_id'],
  ['family_plan_subscriptions', 'owner_id'],
  ['notifications', 'owner_id'],
  ['notifications', 'user_id'],
  ['notification_log', 'user_id'],
  ['notification_preferences', 'user_id'],
  ['data_export_audit_log', 'user_id'],
  ['sync_health_logs', 'user_id'],
  ['user_consents', 'user_id'],
  ['webauthn_challenges', 'user_id'],
  ['passkey_credentials', 'user_id'],
  ['recurring_transaction_templates', 'owner_id'],
  ['transactions', 'owner_id'],
  ['budgets', 'owner_id'],
  ['goals', 'owner_id'],
  ['categories', 'owner_id'],
  ['accounts', 'owner_id'],
  ['audit_log', 'user_id'],
] as const;

export function createAccountDeleteHandler(deps: AccountDeleteDeps = {}) {
  return async (req: Request): Promise<Response> => {
    const envError = validateEnv('auth-logout', req);
    if (envError) return envError;

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...NO_STORE_JSON_HEADERS, Allow: 'POST' },
      });
    }

    let body: AccountDeleteBody = {};
    try {
      body = (await req.json()) as AccountDeleteBody;
    } catch {
      // Empty body is handled by the confirmation check below.
    }

    if (body.confirmation !== 'DELETE' && body.confirm !== 'DELETE') {
      return new Response(JSON.stringify({ error: 'Type DELETE to confirm account deletion' }), {
        status: 400,
        headers: NO_STORE_JSON_HEADERS,
      });
    }

    const supabase = (deps.createClient ?? createAdminClient)();
    const user = await getAuthenticatedUser(req, supabase, deps.refreshGrantFn ?? refreshGrant);
    if (!user) return unauthorized(req);

    try {
      await deleteAccountData(supabase, user);
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (authDeleteError) throw authDeleteError;

      const headers = new Headers({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });
      headers.append('Set-Cookie', buildClearCookie(req, COOKIE_REFRESH));
      headers.append('Set-Cookie', buildClearCookie(req, COOKIE_PKCE));
      headers.append('Set-Cookie', buildClearCookie(req, COOKIE_POST_LOGIN));
      return new Response(null, { status: 204, headers });
    } catch (err) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          function: 'account-delete',
          user_id: user.id,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return new Response(JSON.stringify({ error: 'Could not delete account' }), {
        status: 500,
        headers: NO_STORE_JSON_HEADERS,
      });
    }
  };
}

export const handler = createAccountDeleteHandler();

if (import.meta.main) Deno.serve(handler);

async function getAuthenticatedUser(
  req: Request,
  supabase: SupabaseAdminClient,
  refreshGrantFn: typeof refreshGrant,
): Promise<AuthenticatedUser | null> {
  const accessToken = await getAccessToken(req, refreshGrantFn);
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? '' };
}

async function getAccessToken(
  req: Request,
  refreshGrantFn: typeof refreshGrant,
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  const refreshToken = parseCookies(req)[COOKIE_REFRESH];
  if (!refreshToken) return null;
  const tokens = await refreshGrantFn(refreshToken);
  return tokens?.access_token ?? null;
}

async function deleteAccountData(
  supabase: SupabaseAdminClient,
  user: AuthenticatedUser,
): Promise<void> {
  // ---------------------------------------------------------------------
  // Household deletion policy (issue #1962):
  //
  //   - Solely-owned households (no other members): DELETED entirely.
  //     All child data rows and the household record itself are removed.
  //
  //   - Shared households (>=1 other member): the user's MEMBERSHIP is
  //     removed and any data they personally owned (transactions,
  //     budgets, goals, categories, accounts, etc.) is DELETED via the
  //     USER_OWNED_TABLES loop below. The household entity and the
  //     other members' data stay intact.
  //
  //     We intentionally do NOT silently transfer household ownership
  //     ("created_by") to another member — that surprised collaborators
  //     in alpha. If the deleting user was the recorded creator, the
  //     historical `created_by` reference is cleared (best-effort —
  //     ignored if the column is NOT NULL). The household continues to
  //     exist for the remaining members.
  //
  // Delete order (must not change without testing — see #1960):
  //   1. Resolve household memberships & ownership.
  //   2. Crypto-shred user encryption keys (defense in depth — even if
  //      a later step fails, encrypted data is unrecoverable).
  //   3. Crypto-shred sole-household keys + delete sole-household rows.
  //   4. Detach shared-household ownership references for this user.
  //   5. Delete invitation + audit references that point at this user.
  //   6. Delete every user-owned row across USER_OWNED_TABLES.
  //   7. Delete the user's `household_members` rows and `users` row.
  //   8. (Caller) Delete the Supabase Auth user LAST — keeps re-sign-in
  //      flowing through a fresh signup so no data resurrects.
  // ---------------------------------------------------------------------
  const plans = await loadHouseholdPlans(supabase, user.id);
  const soleHouseholdIds = plans
    .filter((plan) => plan.otherMemberUserIds.length === 0)
    .map((plan) => plan.householdId);
  const sharedHouseholds = plans.filter((plan) => plan.otherMemberUserIds.length > 0);

  // Step 2: crypto-shred user encryption keys (best-effort).
  await bestEffortRpc(supabase, 'destroy_user_encryption_keys', {
    p_user_id: user.id,
    p_destroyed_by: user.id,
    p_reason: 'account_deletion',
  });

  // Step 3: crypto-shred + purge sole-owned households.
  for (const householdId of soleHouseholdIds) {
    await bestEffortRpc(supabase, 'destroy_household_encryption_keys', {
      p_household_id: householdId,
      p_destroyed_by: user.id,
      p_reason: 'account_deletion_sole_owner',
    });
  }

  if (soleHouseholdIds.length > 0) {
    await deleteByIn(supabase, 'encryption_keys', 'household_id', soleHouseholdIds);
    for (const table of HOUSEHOLD_CHILD_TABLES) {
      await deleteByIn(supabase, table, 'household_id', soleHouseholdIds);
    }
    await deleteByIn(supabase, 'households', 'id', soleHouseholdIds);
  }

  // Step 4: detach this user from shared-household ownership without
  // silently re-assigning to another member. Best-effort — if `created_by`
  // is NOT NULL the column update fails harmlessly and the household
  // simply keeps its historical creator pointer (the user row itself is
  // deleted below, so any FK from `households.created_by → users.id`
  // would have prevented account deletion long before we got here; in
  // practice the column is nullable, see #1962 discussion).
  for (const plan of sharedHouseholds) {
    if (plan.createdBy === user.id) {
      await bestEffortUpdate(supabase, 'households', { created_by: null }, 'id', plan.householdId);
    }
  }

  // Step 5: clear references that point AT this user from other people's
  // invitations / audit rows. Without this, FK constraints can block the
  // delete and the user's `users` row would survive.
  await updateRows(
    supabase,
    'household_invitations',
    { accepted_by: null },
    'accepted_by',
    user.id,
  );
  await deleteByEq(supabase, 'household_invitations', 'invited_by', user.id);
  await updateRows(supabase, 'anomaly_alerts', { reviewed_by: null }, 'reviewed_by', user.id);
  await deleteAnomalyRulesOwnedByUser(supabase, user.id);
  await deleteReferralRows(supabase, user.id);

  // Step 6: delete every user-owned row. For shared households this is
  // how the user's contributed data (transactions, budgets, etc.) is
  // removed — they all carry `owner_id = user.id`.
  for (const [table, column] of USER_OWNED_TABLES) {
    await deleteByEq(supabase, table, column, user.id);
  }

  // Step 7: remove key material and membership rows, then the user row.
  await deleteByEq(supabase, 'encryption_keys', 'destroyed_by', user.id);
  await deleteByEq(supabase, 'encryption_keys', 'user_id', user.id);
  await deleteByEq(supabase, 'household_members', 'user_id', user.id);
  await deleteByEq(supabase, 'users', 'id', user.id);
  // Step 8 (`supabase.auth.admin.deleteUser`) is invoked by the caller —
  // ALWAYS LAST so a partial failure leaves the auth row in place and
  // the user can retry from a known state.
}

async function loadHouseholdPlans(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<HouseholdPlan[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (membershipError) throw membershipError;

  const householdIds = [
    ...new Set(
      ((memberships ?? []) as Array<{ household_id: string | null }>)
        .map((membership) => membership.household_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (householdIds.length === 0) return [];

  const { data: households, error: householdError } = await supabase
    .from('households')
    .select('id, created_by')
    .in('id', householdIds);
  if (householdError) throw householdError;

  const createdByByHousehold = new Map(
    ((households ?? []) as Array<{ id: string; created_by: string | null }>).map((household) => [
      household.id,
      household.created_by,
    ]),
  );

  const plans: HouseholdPlan[] = [];
  for (const householdId of householdIds) {
    const { data: others, error: othersError } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId)
      .neq('user_id', userId)
      .is('deleted_at', null);
    if (othersError) throw othersError;

    plans.push({
      householdId,
      createdBy: createdByByHousehold.get(householdId) ?? null,
      otherMemberUserIds: ((others ?? []) as Array<{ user_id: string | null }>)
        .map((member) => member.user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    });
  }
  return plans;
}

async function bestEffortRpc(
  supabase: SupabaseAdminClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc(functionName, args);
  if (error) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        function: 'account-delete',
        rpc: functionName,
        message: error.message,
      }),
    );
  }
}

async function deleteAnomalyRulesOwnedByUser(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.from('anomaly_rules').select('id').eq('owner_id', userId);
  if (error) throw error;

  const ruleIds = ((data ?? []) as Array<{ id: string | null }>)
    .map((rule) => rule.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  await deleteByIn(supabase, 'anomaly_alerts', 'rule_id', ruleIds);
  await deleteByEq(supabase, 'anomaly_rules', 'owner_id', userId);
}

async function deleteReferralRows(supabase: SupabaseAdminClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from('referrals')
    .delete()
    .or(`referrer_id.eq.${userId},referee_id.eq.${userId}`);
  if (error) throw error;
}

async function deleteByEq(
  supabase: SupabaseAdminClient,
  table: string,
  column: string,
  value: string,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) throw error;
}

async function deleteByIn(
  supabase: SupabaseAdminClient,
  table: string,
  column: string,
  values: string[],
): Promise<void> {
  if (values.length === 0) return;
  const { error } = await supabase.from(table).delete().in(column, values);
  if (error) throw error;
}

async function updateRows(
  supabase: SupabaseAdminClient,
  table: string,
  values: Record<string, unknown>,
  column: string,
  value: string,
): Promise<void> {
  const { error } = await supabase.from(table).update(values).eq(column, value);
  if (error) throw error;
}

/**
 * Like updateRows but never throws — used for "nice to clear" pointers
 * such as `households.created_by` where a NOT NULL constraint or RLS
 * failure must NOT block the rest of the deletion. Logged for review.
 */
async function bestEffortUpdate(
  supabase: SupabaseAdminClient,
  table: string,
  values: Record<string, unknown>,
  column: string,
  value: string,
): Promise<void> {
  const { error } = await supabase.from(table).update(values).eq(column, value);
  if (error) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        function: 'account-delete',
        table,
        column,
        message: error.message,
      }),
    );
  }
}

function unauthorized(req: Request): Response {
  const headers = new Headers(NO_STORE_JSON_HEADERS);
  headers.append('Set-Cookie', buildClearCookie(req, COOKIE_REFRESH));
  return new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers,
  });
}
