// SPDX-License-Identifier: BUSL-1.1

import type {
  Account,
  AccountPurpose,
  AccountType,
  Currency,
  HsaCoverageLevel,
  RetirementAccountType,
  RetirementTaxTreatment,
  SyncId,
} from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import { execute, query, queryOne, type AsyncDb, type Row } from '../async-db';
import { notifyMilestoneDataChanged } from '../../lib/milestones';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  requireNumber,
  requireString,
  toBoolean,
} from './helpers';

const ACCOUNT_COLUMNS = [
  'id',
  'household_id',
  'name',
  'type',
  'purpose',
  'retirement_account_type',
  'retirement_tax_treatment',
  'hsa_coverage_level',
  'currency_code',
  'balance_cents',
  'is_active',
  'sort_order',
  'icon',
  'color',
  'created_at',
  'updated_at',
  'deleted_at',
].join(', ');

const ACCOUNT_BASE_QUERY = `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE deleted_at IS NULL`;

/** Input used when creating a new account record. */
export interface CreateAccountInput {
  householdId: SyncId;
  name: string;
  type: AccountType;
  purpose?: AccountPurpose;
  retirementAccountType?: RetirementAccountType | null;
  retirementTaxTreatment?: RetirementTaxTreatment | null;
  hsaCoverageLevel?: HsaCoverageLevel | null;
  currency?: Currency;
  currentBalance: { amount: number };
  isArchived?: boolean;
  sortOrder?: number;
  icon?: string | null;
  color?: string | null;
}

/** Input used when updating an existing account record. */
export interface UpdateAccountInput {
  householdId?: SyncId;
  name?: string;
  type?: AccountType;
  purpose?: AccountPurpose;
  retirementAccountType?: RetirementAccountType | null;
  retirementTaxTreatment?: RetirementTaxTreatment | null;
  hsaCoverageLevel?: HsaCoverageLevel | null;
  currency?: Currency;
  currentBalance?: { amount: number };
  isArchived?: boolean;
  sortOrder?: number;
  icon?: string | null;
  color?: string | null;
}

function mapAccountPurpose(value: unknown): AccountPurpose {
  return value === 'business' || value === 'both' ? value : 'personal';
}

export function mapAccount(row: Row): Account {
  return {
    id: requireString(row.id, 'account.id'),
    householdId: requireString(row.household_id, 'account.household_id'),
    name: requireString(row.name, 'account.name'),
    type: requireString(row.type, 'account.type') as AccountType,
    purpose: mapAccountPurpose(row.purpose),
    retirementAccountType: optionalString(
      row.retirement_account_type,
    ) as RetirementAccountType | null,
    retirementTaxTreatment: optionalString(
      row.retirement_tax_treatment,
    ) as RetirementTaxTreatment | null,
    hsaCoverageLevel: optionalString(row.hsa_coverage_level) as HsaCoverageLevel | null,
    currency: mapCurrency(row.currency_code),
    currentBalance: mapCents(row.balance_cents, 'account.balance_cents'),
    // Unified schema stores is_active; the DTO exposes the inverse isArchived.
    isArchived: !toBoolean(row.is_active),
    sortOrder: requireNumber(row.sort_order, 'account.sort_order'),
    icon: optionalString(row.icon),
    color: optionalString(row.color),
    ...mapSyncMetadata(row),
  };
}

/** Return every non-deleted account ordered by sort order and name. */
export async function getAllAccounts(db: AsyncDb): Promise<Account[]> {
  const { rows } = await query<Row>(db, `${ACCOUNT_BASE_QUERY} ORDER BY sort_order ASC, name ASC`);
  return rows.map(mapAccount);
}

/** Find a single non-deleted account by its identifier. */
export async function getAccountById(db: AsyncDb, accountId: SyncId): Promise<Account | null> {
  const row = await queryOne<Row>(db, `${ACCOUNT_BASE_QUERY} AND id = ?`, [accountId]);
  return row ? mapAccount(row) : null;
}

/** Insert a new account row and return the created account. */
export async function createAccount(db: AsyncDb, input: CreateAccountInput): Promise<Account> {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;
  const purpose = input.purpose ?? 'personal';
  const retirementAccountType = input.retirementAccountType ?? null;
  const retirementTaxTreatment = retirementAccountType
    ? (input.retirementTaxTreatment ?? null)
    : null;
  const hsaCoverageLevel =
    retirementAccountType === 'HSA' ? (input.hsaCoverageLevel ?? null) : null;

  await execute(
    db,
    `INSERT INTO accounts (
      id,
      household_id,
      name,
      type,
      purpose,
      retirement_account_type,
      retirement_tax_treatment,
      hsa_coverage_level,
      currency_code,
      balance_cents,
      is_active,
      sort_order,
      icon,
      color,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL
    )`,
    [
      id,
      input.householdId,
      input.name,
      input.type,
      purpose,
      retirementAccountType,
      retirementTaxTreatment,
      hsaCoverageLevel,
      currency.code,
      input.currentBalance.amount,
      input.isArchived ? 0 : 1,
      input.sortOrder ?? 0,
      input.icon ?? null,
      input.color ?? null,
    ],
  );

  const createdAccount = await getAccountById(db, id);
  if (!createdAccount) {
    throw new Error('Failed to create account.');
  }

  notifyMilestoneDataChanged();
  return createdAccount;
}

/** Update an account row and return the refreshed account. */
export async function updateAccount(
  db: AsyncDb,
  accountId: SyncId,
  updates: UpdateAccountInput,
): Promise<Account | null> {
  const existingAccount = await getAccountById(db, accountId);
  if (!existingAccount) {
    return null;
  }

  const mergedAccount = {
    householdId: updates.householdId ?? existingAccount.householdId,
    name: updates.name ?? existingAccount.name,
    type: updates.type ?? existingAccount.type,
    purpose: updates.purpose ?? existingAccount.purpose ?? 'personal',
    retirementAccountType:
      updates.retirementAccountType !== undefined
        ? updates.retirementAccountType
        : (existingAccount.retirementAccountType ?? null),
    retirementTaxTreatment:
      updates.retirementTaxTreatment !== undefined
        ? updates.retirementTaxTreatment
        : (existingAccount.retirementTaxTreatment ?? null),
    hsaCoverageLevel:
      updates.hsaCoverageLevel !== undefined
        ? updates.hsaCoverageLevel
        : (existingAccount.hsaCoverageLevel ?? null),
    currency: updates.currency ?? existingAccount.currency,
    currentBalance: updates.currentBalance ?? existingAccount.currentBalance,
    isArchived: updates.isArchived ?? existingAccount.isArchived,
    sortOrder: updates.sortOrder ?? existingAccount.sortOrder,
    icon: updates.icon !== undefined ? updates.icon : existingAccount.icon,
    color: updates.color !== undefined ? updates.color : existingAccount.color,
  };

  await execute(
    db,
    `UPDATE accounts
        SET household_id = ?,
            name = ?,
            type = ?,
            purpose = ?,
            retirement_account_type = ?,
            retirement_tax_treatment = ?,
            hsa_coverage_level = ?,
            currency_code = ?,
            balance_cents = ?,
            is_active = ?,
            sort_order = ?,
            icon = ?,
            color = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION}
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedAccount.householdId,
      mergedAccount.name,
      mergedAccount.type,
      mergedAccount.purpose,
      mergedAccount.retirementAccountType,
      mergedAccount.retirementAccountType ? mergedAccount.retirementTaxTreatment : null,
      mergedAccount.retirementAccountType === 'HSA' ? mergedAccount.hsaCoverageLevel : null,
      mergedAccount.currency.code,
      mergedAccount.currentBalance.amount,
      mergedAccount.isArchived ? 0 : 1,
      mergedAccount.sortOrder,
      mergedAccount.icon,
      mergedAccount.color,
      accountId,
    ],
  );

  const updatedAccount = await getAccountById(db, accountId);
  if (updatedAccount) {
    notifyMilestoneDataChanged();
  }

  return updatedAccount;
}

/** Soft-delete an account row by marking its deleted timestamp. */
export async function deleteAccount(db: AsyncDb, accountId: SyncId): Promise<boolean> {
  const existingAccount = await getAccountById(db, accountId);
  if (!existingAccount) {
    return false;
  }

  await execute(
    db,
    `UPDATE accounts
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION}
      WHERE id = ?
        AND deleted_at IS NULL`,
    [accountId],
  );

  notifyMilestoneDataChanged();
  return true;
}

/** Return all non-deleted accounts for a specific account type. */
export async function getAccountsByType(db: AsyncDb, type: AccountType): Promise<Account[]> {
  const { rows } = await query<Row>(
    db,
    `${ACCOUNT_BASE_QUERY} AND type = ? ORDER BY sort_order ASC, name ASC`,
    [type],
  );
  return rows.map(mapAccount);
}

/** Recompute an account balance from its non-deleted transactions. */
export async function recomputeAccountBalance(db: AsyncDb, accountId: SyncId): Promise<void> {
  await execute(
    db,
    `UPDATE accounts
        SET balance_cents = (
              SELECT COALESCE(SUM(amount_cents), 0)
              FROM transactions
              WHERE account_id = ?
                AND deleted_at IS NULL
            ),
            updated_at = ${SQLITE_NOW_EXPRESSION}
      WHERE id = ?
        AND deleted_at IS NULL`,
    [accountId, accountId],
  );
}
