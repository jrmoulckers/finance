// SPDX-License-Identifier: BUSL-1.1

/**
 * Canonical PowerSync client schema for the Finance web app.
 *
 * This is the client-side mirror of `services/api/powersync/sync-rules.yaml`
 * (the server-side source of truth). Every table below matches a synced table
 * in the sync rules: plural table names, integer-cents money columns
 * (`*_cents`), ISO-4217 `currency_code`, and soft-delete `deleted_at`.
 *
 * IMPORTANT invariants (keep in lock-step with the sync rules):
 *   - PowerSync manages an implicit `id TEXT` primary key on every table, so it
 *     is intentionally omitted from the column lists here.
 *   - Monetary values are always integer cents (`column.integer`) — never
 *     floating point. They pair with a `currency_code`.
 *   - Booleans sync as 0/1 integers.
 *   - Any column the server allowlists but the client omits here is silently
 *     dropped on the client, so this list must stay complete.
 *
 * References: sync-rules.yaml, issues #3941 / #3935.
 */

import { Schema, Table, column } from '@powersync/common';

const { text, integer, real } = column;

// ---------------------------------------------------------------------------
// by_household bucket — data scoped to the households the user belongs to.
// ---------------------------------------------------------------------------

const households = new Table({
  name: text,
  created_by: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const accounts = new Table(
  {
    household_id: text,
    name: text,
    type: text,
    currency_code: text,
    balance_cents: integer,
    is_active: integer,
    icon: text,
    color: text,
    sort_order: integer,
    owner_id: text,
    created_at: text,
    updated_at: text,
    deleted_at: text,
  },
  { indexes: { by_household: ['household_id'] } },
);

const transactions = new Table(
  {
    household_id: text,
    account_id: text,
    category_id: text,
    amount_cents: integer,
    currency_code: text,
    type: text,
    payee: text,
    note: text,
    date: text,
    is_recurring: integer,
    transfer_account_id: text,
    status: text,
    transfer_transaction_id: text,
    recurring_rule_id: text,
    tags: text,
    is_biometric_protected: integer,
    owner_id: text,
    created_at: text,
    updated_at: text,
    deleted_at: text,
  },
  { indexes: { by_account: ['account_id'], by_date: ['date'] } },
);

const categories = new Table({
  household_id: text,
  name: text,
  icon: text,
  color: text,
  parent_id: text,
  is_income: integer,
  is_system: integer,
  sort_order: integer,
  is_biometric_protected: integer,
  owner_id: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const budgets = new Table({
  household_id: text,
  category_id: text,
  name: text,
  amount_cents: integer,
  currency_code: text,
  period: text,
  start_date: text,
  end_date: text,
  is_rollover: integer,
  owner_id: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const goals = new Table({
  household_id: text,
  name: text,
  target_cents: integer,
  current_cents: integer,
  currency_code: text,
  target_date: text,
  icon: text,
  color: text,
  account_id: text,
  status: text,
  owner_id: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const household_members = new Table({
  household_id: text,
  user_id: text,
  role: text,
  joined_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const household_invitations = new Table({
  household_id: text,
  invited_by: text,
  role: text,
  expires_at: text,
  accepted_at: text,
  accepted_by: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const recurring_transaction_templates = new Table({
  household_id: text,
  account_id: text,
  category_id: text,
  amount_cents: integer,
  currency_code: text,
  type: text,
  payee: text,
  note: text,
  frequency: text,
  day_of_month: integer,
  day_of_week: integer,
  start_date: text,
  end_date: text,
  last_generated_date: text,
  next_due_date: text,
  is_active: integer,
  owner_id: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const family_plan_subscriptions = new Table({
  household_id: text,
  billing_owner_id: text,
  owner_id: text,
  plan_type: text,
  status: text,
  price_cents: integer,
  currency_code: text,
  billing_cycle: text,
  max_members: integer,
  current_members: integer,
  started_at: text,
  current_period_end: text,
  canceled_at: text,
  expires_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const report_configs = new Table({
  household_id: text,
  owner_id: text,
  name: text,
  report_type: text,
  config: text,
  last_generated_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const detected_bills = new Table({
  household_id: text,
  owner_id: text,
  merchant: text,
  estimated_amount_cents: integer,
  currency_code: text,
  frequency: text,
  confidence_score: real,
  last_transaction_date: text,
  next_expected_date: text,
  transaction_count: integer,
  avg_amount_cents: integer,
  status: text,
  category_id: text,
  account_id: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const investment_portfolios = new Table({
  household_id: text,
  owner_id: text,
  name: text,
  description: text,
  currency_code: text,
  is_active: integer,
  provider: text,
  last_synced_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const investment_holdings = new Table({
  portfolio_id: text,
  household_id: text,
  owner_id: text,
  ticker_symbol: text,
  name: text,
  asset_type: text,
  quantity_units: integer,
  quantity_precision: integer,
  cost_basis_cents: integer,
  currency_code: text,
  acquired_date: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const bill_reminders = new Table({
  household_id: text,
  owner_id: text,
  detected_bill_id: text,
  merchant: text,
  amount_cents: integer,
  currency_code: text,
  frequency: text,
  next_due_date: text,
  is_auto_pay: integer,
  is_active: integer,
  reminder_days: integer,
  account_id: text,
  category_id: text,
  note: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const report_templates = new Table({
  household_id: text,
  owner_id: text,
  name: text,
  description: text,
  report_type: text,
  template_config: text,
  is_default: integer,
  usage_count: integer,
  last_used_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const import_jobs = new Table({
  household_id: text,
  owner_id: text,
  account_id: text,
  file_name: text,
  format: text,
  status: text,
  total_rows: integer,
  imported_rows: integer,
  duplicate_rows: integer,
  error_rows: integer,
  source_type: text,
  duplicate_strategy: text,
  started_at: text,
  completed_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const bank_connections = new Table({
  household_id: text,
  owner_id: text,
  provider: text,
  institution_id: text,
  institution_name: text,
  status: text,
  last_synced_at: text,
  error_code: text,
  error_message: text,
  metadata: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const bank_connection_health = new Table({
  bank_connection_id: text,
  household_id: text,
  status: text,
  error_category: text,
  error_detail: text,
  last_successful_sync: text,
  staleness_minutes: integer,
  resolved_at: text,
  resolution_action: text,
  created_at: text,
});

const connector_permissions = new Table({
  bank_connection_id: text,
  household_id: text,
  owner_id: text,
  permission_level: text,
  granted_scopes: text,
  scope_descriptions: text,
  is_revoked: integer,
  revoked_at: text,
  token_status: text,
  token_expires_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const connector_access_log = new Table({
  bank_connection_id: text,
  household_id: text,
  access_type: text,
  provider_name: text,
  status: text,
  record_count: integer,
  duration_ms: integer,
  created_at: text,
});

const open_banking_connections = new Table({
  bank_connection_id: text,
  household_id: text,
  owner_id: text,
  consent_id: text,
  consent_status: text,
  consent_expires_at: text,
  regulation: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

// ---------------------------------------------------------------------------
// user_profile bucket — per-user data that is not household-scoped.
// ---------------------------------------------------------------------------

const users = new Table({
  email: text,
  display_name: text,
  avatar_url: text,
  currency_code: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const passkey_credentials = new Table({
  user_id: text,
  credential_id: text,
  device_type: text,
  backed_up: integer,
  transports: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const referrals = new Table({
  referrer_id: text,
  referee_id: text,
  referral_code: text,
  status: text,
  reward_type: text,
  accepted_at: text,
  expires_at: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const user_consents = new Table({
  user_id: text,
  consent_type: text,
  status: text,
  policy_version: text,
  created_at: text,
});

// ---------------------------------------------------------------------------
// exchange_rates bucket — global, read-only reference data.
// ---------------------------------------------------------------------------

const exchange_rates = new Table({
  base_currency: text,
  target_currency: text,
  rate_multiplied: integer,
  rate_precision: integer,
  source: text,
  valid_date: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const price_history = new Table({
  ticker_symbol: text,
  close_price_cents: integer,
  currency_code: text,
  price_date: text,
  source: text,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

const aggregator_providers = new Table({
  name: text,
  display_name: text,
  provider_type: text,
  status: text,
  health_score: real,
  priority: integer,
  is_enabled: integer,
  supported_regions: text,
  capabilities: text,
  last_health_check: text,
  incident_count: integer,
  created_at: text,
  updated_at: text,
  deleted_at: text,
});

/**
 * The canonical app schema handed to `PowerSyncDatabase`. The object keys are
 * the synced table names (must match the sync rules exactly).
 */
export const AppSchema = new Schema({
  households,
  accounts,
  transactions,
  categories,
  budgets,
  goals,
  household_members,
  household_invitations,
  recurring_transaction_templates,
  family_plan_subscriptions,
  report_configs,
  detected_bills,
  investment_portfolios,
  investment_holdings,
  bill_reminders,
  report_templates,
  import_jobs,
  bank_connections,
  bank_connection_health,
  connector_permissions,
  connector_access_log,
  open_banking_connections,
  users,
  passkey_credentials,
  referrals,
  user_consents,
  exchange_rates,
  price_history,
  aggregator_providers,
});

/** Convenience list of all synced table names in the canonical schema. */
export const SYNCED_TABLE_NAMES: readonly string[] = AppSchema.tables.map((table) => table.name);
