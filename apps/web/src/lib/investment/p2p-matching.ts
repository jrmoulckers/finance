// SPDX-License-Identifier: BUSL-1.1

/** Reimbursement and split-payment matching engine for P2P flows. References: issue #2643 */
export type P2PTransactionKind = 'bank' | 'p2p-payment' | 'p2p-request' | 'manual';
export type P2PMatchType =
  'reimbursement' | 'roommate-rent' | 'meal-split' | 'pass-through-transfer' | 'ambiguous';
export type P2POverrideState = 'none' | 'confirmed' | 'rejected' | 'edited';

export interface P2PTransaction {
  readonly id: string;
  readonly kind: P2PTransactionKind;
  readonly date: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly counterparty?: string;
  readonly memo?: string;
  readonly category?: string;
}

export interface P2POverride {
  readonly transactionIds: readonly string[];
  readonly state: P2POverrideState;
  readonly reason: string;
  readonly updatedAt: string;
}

export interface P2PMatch {
  readonly type: P2PMatchType;
  readonly transactionIds: readonly string[];
  readonly netAmountCents: number;
  readonly confidence: number;
  readonly reason: string;
  readonly overrideState: P2POverrideState;
  readonly auditTrail: readonly string[];
}

export interface P2PMatchInput {
  readonly transactions: readonly P2PTransaction[];
  readonly overrides?: readonly P2POverride[];
  readonly maxDaysApart?: number;
  readonly amountToleranceCents?: number;
}

function daysApart(a: string, b: string): number {
  const dayA = Math.floor(new Date(`${a}T00:00:00.000Z`).getTime() / 86_400_000);
  const dayB = Math.floor(new Date(`${b}T00:00:00.000Z`).getTime() / 86_400_000);
  return Math.abs(dayA - dayB);
}

function classify(transactions: readonly P2PTransaction[]): {
  type: P2PMatchType;
  confidence: number;
  reason: string;
} {
  const joined = transactions
    .map((transaction) => `${transaction.memo ?? ''} ${transaction.category ?? ''}`)
    .join(' ')
    .toLowerCase();
  if (/rent|utilities|roommate/.test(joined))
    return {
      type: 'roommate-rent',
      confidence: 0.9,
      reason: 'Memo/category indicates recurring roommate housing reimbursement.',
    };
  if (/dinner|lunch|meal|restaurant|split/.test(joined))
    return {
      type: 'meal-split',
      confidence: 0.82,
      reason: 'Memo/category indicates shared meal split.',
    };
  if (/transfer|move money|self/.test(joined))
    return {
      type: 'pass-through-transfer',
      confidence: 0.8,
      reason: 'Memo indicates pass-through/self transfer.',
    };
  return {
    type: 'reimbursement',
    confidence: 0.7,
    reason: 'Opposite signed transactions net near zero.',
  };
}

function overrideKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}

export function matchP2PTransactions(input: P2PMatchInput): readonly P2PMatch[] {
  const maxDaysApart = input.maxDaysApart ?? 7;
  const amountToleranceCents = input.amountToleranceCents ?? 100;
  const overrides = new Map(
    (input.overrides ?? []).map((override) => [overrideKey(override.transactionIds), override]),
  );
  const matches: P2PMatch[] = [];
  const used = new Set<string>();
  const sorted = [...input.transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const expense of sorted) {
    if (used.has(expense.id) || expense.amountCents >= 0) continue;
    const candidate = sorted.find((item) => {
      if (
        used.has(item.id) ||
        item.id === expense.id ||
        item.amountCents <= 0 ||
        item.currency !== expense.currency
      )
        return false;
      if (daysApart(expense.date, item.date) > maxDaysApart) return false;
      const sameCounterparty =
        !expense.counterparty ||
        !item.counterparty ||
        expense.counterparty.toLowerCase() === item.counterparty.toLowerCase();
      return (
        sameCounterparty &&
        Math.abs(expense.amountCents + item.amountCents) <=
          Math.max(amountToleranceCents, Math.round(Math.abs(expense.amountCents) * 0.55))
      );
    });
    if (!candidate) continue;
    const transactions = [expense, candidate];
    const ids = transactions.map((transaction) => transaction.id);
    const detected = classify(transactions);
    const override = overrides.get(overrideKey(ids));
    matches.push({
      type: override?.state === 'rejected' ? 'ambiguous' : detected.type,
      transactionIds: ids,
      netAmountCents: transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0),
      confidence: override?.state === 'confirmed' ? 1 : detected.confidence,
      reason: override?.reason ?? detected.reason,
      overrideState: override?.state ?? 'none',
      auditTrail: [
        detected.reason,
        ...(override
          ? [`Override ${override.state} at ${override.updatedAt}: ${override.reason}`]
          : []),
      ],
    });
    used.add(expense.id);
    used.add(candidate.id);
  }

  return matches;
}
