// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { AppSchema, SYNCED_TABLE_NAMES } from '../schema';

/** Look up a resolved table by its synced name. */
function table(name: string) {
  const found = AppSchema.tables.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`table ${name} missing from AppSchema`);
  }
  return found;
}

/** Column type (TEXT/INTEGER/REAL) for a named column on a table. */
function columnType(tableName: string, columnName: string): string | undefined {
  return table(tableName).columns.find((column) => column.name === columnName)?.type;
}

describe('AppSchema', () => {
  it('mirrors every table declared in the canonical sync rules', () => {
    // Three buckets: by_household + user_profile + exchange_rates. Includes the
    // four schema-unification tables (goal_progress_contributions,
    // account_reconciliations, invoices, remittances) = 33 tables.
    expect(SYNCED_TABLE_NAMES).toHaveLength(33);

    for (const name of [
      'accounts',
      'transactions',
      'categories',
      'budgets',
      'goals',
      'households',
      'household_members',
      'recurring_transaction_templates',
      'detected_bills',
      'investment_holdings',
      'users',
      'passkey_credentials',
      'exchange_rates',
      'price_history',
      'aggregator_providers',
      'goal_progress_contributions',
      'account_reconciliations',
      'invoices',
      'remittances',
    ]) {
      expect(SYNCED_TABLE_NAMES).toContain(name);
    }
  });

  it('uses plural, canonical table names (not the divergent legacy singulars)', () => {
    expect(SYNCED_TABLE_NAMES).toContain('accounts');
    expect(SYNCED_TABLE_NAMES).not.toContain('account');
    expect(SYNCED_TABLE_NAMES).not.toContain('transaction');
  });

  it('never declares an explicit id column (PowerSync manages the implicit PK)', () => {
    for (const resolved of AppSchema.tables) {
      expect(resolved.columns.some((column) => column.name === 'id')).toBe(false);
    }
  });

  it('models monetary columns as integer cents', () => {
    expect(columnType('accounts', 'balance_cents')).toBe('INTEGER');
    expect(columnType('transactions', 'amount_cents')).toBe('INTEGER');
    expect(columnType('budgets', 'amount_cents')).toBe('INTEGER');
    expect(columnType('goals', 'target_cents')).toBe('INTEGER');
    expect(columnType('goals', 'current_cents')).toBe('INTEGER');
  });

  it('models booleans as integers and free-form text as text', () => {
    expect(columnType('accounts', 'is_active')).toBe('INTEGER');
    expect(columnType('transactions', 'is_recurring')).toBe('INTEGER');
    expect(columnType('accounts', 'currency_code')).toBe('TEXT');
    expect(columnType('accounts', 'owner_id')).toBe('TEXT');
    expect(columnType('transactions', 'household_id')).toBe('TEXT');
  });

  it('models genuinely fractional values as real', () => {
    expect(columnType('detected_bills', 'confidence_score')).toBe('REAL');
    expect(columnType('aggregator_providers', 'health_score')).toBe('REAL');
  });

  it('carries the schema-alignment columns added for canonical parity', () => {
    expect(columnType('transactions', 'transfer_transaction_id')).toBe('TEXT');
    expect(columnType('transactions', 'recurring_rule_id')).toBe('TEXT');
    expect(columnType('budgets', 'is_rollover')).toBe('INTEGER');
    expect(columnType('goals', 'account_id')).toBe('TEXT');
    expect(columnType('goals', 'status')).toBe('TEXT');
  });

  it('carries the schema-unification superset columns on the core tables', () => {
    // accounts: retirement/HSA + purpose metadata.
    expect(columnType('accounts', 'purpose')).toBe('TEXT');
    expect(columnType('accounts', 'retirement_account_type')).toBe('TEXT');
    expect(columnType('accounts', 'hsa_coverage_level')).toBe('TEXT');
    // transactions: enrichment + merchant + splits + retirement contribution.
    expect(columnType('transactions', 'mood_tag')).toBe('TEXT');
    expect(columnType('transactions', 'merchant_city')).toBe('TEXT');
    expect(columnType('transactions', 'splits')).toBe('TEXT');
    expect(columnType('transactions', 'counterparty_name')).toBe('TEXT');
    expect(columnType('transactions', 'retirement_contribution_year')).toBe('INTEGER');
    // budgets/goals: manual ordering + goal description.
    expect(columnType('budgets', 'sort_order')).toBe('INTEGER');
    expect(columnType('goals', 'description')).toBe('TEXT');
    expect(columnType('goals', 'sort_order')).toBe('INTEGER');
  });

  it('adds the four previously web-only tables to the synced schema', () => {
    expect(columnType('goal_progress_contributions', 'amount')).toBe('INTEGER');
    expect(columnType('goal_progress_contributions', 'goal_id')).toBe('TEXT');
    expect(columnType('account_reconciliations', 'statement_balance')).toBe('INTEGER');
    expect(columnType('account_reconciliations', 'transaction_ids')).toBe('TEXT');
    expect(columnType('invoices', 'amount_cents')).toBe('INTEGER');
    expect(columnType('invoices', 'client_name')).toBe('TEXT');
    expect(columnType('remittances', 'send_amount_minor')).toBe('INTEGER');
    expect(columnType('remittances', 'fx_rate')).toBe('REAL');
  });
});
