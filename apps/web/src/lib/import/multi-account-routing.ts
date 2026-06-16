// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure multi-account import routing helpers.
 * References: #2269.
 */

export interface SourceAccountTransaction {
  readonly rowIndex: number;
  readonly date: string;
  readonly payee: string;
  readonly amountCents: number;
  readonly sourceAccountName: string | null;
  readonly sourceAccountId?: string | null;
  readonly sourceTransactionId?: string | null;
  readonly category?: string | null;
}

export interface ExistingImportAccount {
  readonly id: string;
  readonly name: string;
  readonly externalAccountId?: string | null;
  readonly type?: string | null;
}

export type AccountMappingAction = 'match' | 'create' | 'needs_review';

export interface SourceAccountSummary {
  readonly sourceKey: string;
  readonly sourceName: string;
  readonly transactionCount: number;
  readonly amountCentsTotal: number;
  readonly matchedAccountId: string | null;
  readonly matchConfidence: number;
  readonly action: AccountMappingAction;
}

export interface AccountRoutingPlan {
  readonly accounts: readonly SourceAccountSummary[];
  readonly unroutedRowIndexes: readonly number[];
}

export interface AccountRouteOverride {
  readonly sourceKey: string;
  readonly accountId: string | null;
  readonly action?: AccountMappingAction;
}

export interface RoutedImportTransaction extends SourceAccountTransaction {
  readonly targetAccountId: string | null;
  readonly routingAction: AccountMappingAction;
}

export interface TransferCandidate {
  readonly debitRowIndex: number;
  readonly creditRowIndex: number;
  readonly amountCents: number;
  readonly confidence: number;
  readonly reason: string;
}

export function buildAccountRoutingPlan(
  transactions: readonly SourceAccountTransaction[],
  existingAccounts: readonly ExistingImportAccount[],
): AccountRoutingPlan {
  const grouped = new Map<string, SourceAccountTransaction[]>();
  const unroutedRowIndexes: number[] = [];

  for (const transaction of transactions) {
    const key = getSourceAccountKey(transaction);
    if (!key) {
      unroutedRowIndexes.push(transaction.rowIndex);
      continue;
    }
    const existing = grouped.get(key) ?? [];
    existing.push(transaction);
    grouped.set(key, existing);
  }

  const accounts = Array.from(grouped.entries()).map(([sourceKey, rows]) => {
    const first = rows[0];
    const sourceName = first.sourceAccountName?.trim() || first.sourceAccountId?.trim() || 'Unknown account';
    const match = findBestAccountMatch(sourceName, first.sourceAccountId ?? null, existingAccounts);
    const action: AccountMappingAction = match.confidence >= 0.9 ? 'match' : match.confidence >= 0.65 ? 'needs_review' : 'create';

    return {
      sourceKey,
      sourceName,
      transactionCount: rows.length,
      amountCentsTotal: rows.reduce((total, row) => total + row.amountCents, 0),
      matchedAccountId: match.accountId,
      matchConfidence: match.confidence,
      action,
    };
  });

  return {
    accounts: accounts.sort((left, right) => left.sourceName.localeCompare(right.sourceName)),
    unroutedRowIndexes: unroutedRowIndexes.sort((left, right) => left - right),
  };
}

export function routeTransactionsToAccounts(
  transactions: readonly SourceAccountTransaction[],
  plan: AccountRoutingPlan,
  overrides: readonly AccountRouteOverride[] = [],
): readonly RoutedImportTransaction[] {
  const planned = new Map(plan.accounts.map((account) => [account.sourceKey, account]));
  const overridden = new Map(overrides.map((override) => [override.sourceKey, override]));

  return transactions.map((transaction) => {
    const sourceKey = getSourceAccountKey(transaction);
    const accountPlan = sourceKey ? planned.get(sourceKey) : undefined;
    const override = sourceKey ? overridden.get(sourceKey) : undefined;
    const action = override?.action ?? accountPlan?.action ?? 'needs_review';
    const targetAccountId = override ? override.accountId : (accountPlan?.matchedAccountId ?? null);

    return {
      ...transaction,
      targetAccountId,
      routingAction: targetAccountId ? action : 'needs_review',
    };
  });
}

export function findTransferCandidates(
  transactions: readonly SourceAccountTransaction[],
  maxDateDistanceDays = 3,
): readonly TransferCandidate[] {
  const candidates: TransferCandidate[] = [];

  for (let i = 0; i < transactions.length; i++) {
    for (let j = i + 1; j < transactions.length; j++) {
      const left = transactions[i];
      const right = transactions[j];
      if (left.amountCents + right.amountCents !== 0) continue;
      if (sameSourceAccount(left, right)) continue;

      const dateDistance = Math.abs(daysBetween(left.date, right.date));
      if (dateDistance > maxDateDistanceDays) continue;

      const confidence = scoreTransferPair(left, right, dateDistance, maxDateDistanceDays);
      if (confidence < 0.5) continue;

      const debit = left.amountCents < 0 ? left : right;
      const credit = left.amountCents < 0 ? right : left;
      candidates.push({
        debitRowIndex: debit.rowIndex,
        creditRowIndex: credit.rowIndex,
        amountCents: Math.abs(left.amountCents),
        confidence,
        reason: buildTransferReason(left, right, dateDistance),
      });
    }
  }

  return candidates.sort((left, right) => right.confidence - left.confidence);
}

function findBestAccountMatch(
  sourceName: string,
  sourceAccountId: string | null,
  existingAccounts: readonly ExistingImportAccount[],
): { accountId: string | null; confidence: number } {
  let best = { accountId: null as string | null, confidence: 0 };
  const normalizedSource = normalizeAccountText(sourceName);
  const sourceLast4 = lastFourDigits(sourceAccountId ?? sourceName);

  for (const account of existingAccounts) {
    let confidence = 0;
    const normalizedName = normalizeAccountText(account.name);
    if (sourceAccountId && account.externalAccountId && sourceAccountId === account.externalAccountId) {
      confidence = 1;
    } else if (normalizedName === normalizedSource) {
      confidence = 0.95;
    } else if (sourceLast4 && lastFourDigits(account.externalAccountId ?? account.name) === sourceLast4) {
      confidence = 0.75;
    } else if (normalizedName.includes(normalizedSource) || normalizedSource.includes(normalizedName)) {
      confidence = 0.7;
    }

    if (confidence > best.confidence) {
      best = { accountId: account.id, confidence };
    }
  }

  return best;
}

function getSourceAccountKey(transaction: SourceAccountTransaction): string | null {
  const id = transaction.sourceAccountId?.trim();
  if (id) return `id:${normalizeAccountText(id)}`;
  const name = transaction.sourceAccountName?.trim();
  if (name) return `name:${normalizeAccountText(name)}`;
  return null;
}

function sameSourceAccount(left: SourceAccountTransaction, right: SourceAccountTransaction): boolean {
  return getSourceAccountKey(left) !== null && getSourceAccountKey(left) === getSourceAccountKey(right);
}

function scoreTransferPair(
  left: SourceAccountTransaction,
  right: SourceAccountTransaction,
  dateDistance: number,
  maxDateDistanceDays: number,
): number {
  let score = 0.5;
  const text = `${left.payee} ${right.payee} ${left.category ?? ''} ${right.category ?? ''}`.toLowerCase();
  if (/transfer|xfer|payment|autopay/.test(text)) score += 0.25;
  if (mentionsAccount(left, right) || mentionsAccount(right, left)) score += 0.15;
  score += (maxDateDistanceDays - dateDistance) / Math.max(maxDateDistanceDays, 1) * 0.1;
  return Math.min(1, Number(score.toFixed(2)));
}

function mentionsAccount(transaction: SourceAccountTransaction, other: SourceAccountTransaction): boolean {
  const account = normalizeAccountText(other.sourceAccountName ?? other.sourceAccountId ?? '');
  if (!account) return false;
  return normalizeAccountText(transaction.payee).includes(account);
}

function buildTransferReason(
  left: SourceAccountTransaction,
  right: SourceAccountTransaction,
  dateDistance: number,
): string {
  return `Opposite amounts across ${left.sourceAccountName ?? 'one account'} and ${right.sourceAccountName ?? 'another account'} within ${dateDistance} day(s)`;
}

function normalizeAccountText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function lastFourDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function daysBetween(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return Number.POSITIVE_INFINITY;
  return Math.round((rightMs - leftMs) / 86_400_000);
}
