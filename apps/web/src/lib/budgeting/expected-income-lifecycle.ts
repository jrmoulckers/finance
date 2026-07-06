// SPDX-License-Identifier: BUSL-1.1

export type ExpectedIncomeStatus = 'expected' | 'cleared' | 'late' | 'partial' | 'missed';
export type ExpectedIncomeSourceType =
  'child_support' | 'freelance' | 'reimbursement' | 'tips' | 'other';

export interface ExpectedIncomeRecord {
  readonly id: string;
  readonly sourceType: ExpectedIncomeSourceType;
  readonly sourceName: string;
  readonly amountCents: number;
  readonly expectedDate: string;
  readonly expectedWindowDays: number;
  readonly reliability: 'low' | 'medium' | 'high';
  readonly status: ExpectedIncomeStatus;
  readonly clearedAmountCents?: number;
  readonly linkedTransactionId?: string;
  readonly updatedAt: string;
}

export interface ExpectedIncomeSummary {
  readonly clearedCashCents: number;
  readonly expectedCashCents: number;
  readonly atRiskCashCents: number;
  readonly spendablePlanningCashCents: number;
  readonly lateCount: number;
  readonly calmDashboardCopy: string;
}

function assertAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('Expected income amounts must be non-negative integer cents.');
  }
}

export function createExpectedIncomeRecord(input: {
  readonly id: string;
  readonly sourceType: ExpectedIncomeSourceType;
  readonly sourceName: string;
  readonly amountCents: number;
  readonly expectedDate: string;
  readonly expectedWindowDays?: number;
  readonly reliability?: ExpectedIncomeRecord['reliability'];
  readonly now?: string;
}): ExpectedIncomeRecord {
  assertAmount(input.amountCents);
  return {
    id: input.id,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    amountCents: input.amountCents,
    expectedDate: input.expectedDate,
    expectedWindowDays: Math.max(0, Math.floor(input.expectedWindowDays ?? 0)),
    reliability: input.reliability ?? 'medium',
    status: 'expected',
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

export function markExpectedIncomeStatus(
  record: ExpectedIncomeRecord,
  status: Exclude<ExpectedIncomeStatus, 'cleared' | 'partial'>,
  now: string = new Date().toISOString(),
): ExpectedIncomeRecord {
  return { ...record, status, updatedAt: now };
}

export function linkExpectedIncomeToClearedTransaction(input: {
  readonly record: ExpectedIncomeRecord;
  readonly transactionId: string;
  readonly clearedAmountCents: number;
  readonly now?: string;
}): ExpectedIncomeRecord {
  assertAmount(input.clearedAmountCents);
  return {
    ...input.record,
    status: input.clearedAmountCents >= input.record.amountCents ? 'cleared' : 'partial',
    clearedAmountCents: input.clearedAmountCents,
    linkedTransactionId: input.transactionId,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

function endOfWindow(record: ExpectedIncomeRecord): string {
  const date = new Date(`${record.expectedDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + record.expectedWindowDays);
  return date.toISOString().slice(0, 10);
}

export function deriveExpectedIncomeStatus(
  record: ExpectedIncomeRecord,
  asOfDate: string,
): ExpectedIncomeStatus {
  if (record.status !== 'expected') return record.status;
  return endOfWindow(record) < asOfDate ? 'late' : 'expected';
}

export function summarizeExpectedIncome(params: {
  readonly records: readonly ExpectedIncomeRecord[];
  readonly asOfDate: string;
  readonly includeAtRiskInSpendable?: boolean;
}): ExpectedIncomeSummary {
  let clearedCashCents = 0;
  let expectedCashCents = 0;
  let atRiskCashCents = 0;
  let lateCount = 0;

  for (const record of params.records) {
    const status = deriveExpectedIncomeStatus(record, params.asOfDate);
    if (status === 'cleared' || status === 'partial') {
      clearedCashCents += record.clearedAmountCents ?? 0;
      if (status === 'partial')
        atRiskCashCents += Math.max(0, record.amountCents - (record.clearedAmountCents ?? 0));
      continue;
    }
    if (status === 'expected' && record.reliability === 'high') {
      expectedCashCents += record.amountCents;
    } else if (status !== 'missed') {
      atRiskCashCents += record.amountCents;
      if (status === 'late') lateCount += 1;
    }
  }

  const spendablePlanningCashCents =
    clearedCashCents + expectedCashCents + (params.includeAtRiskInSpendable ? atRiskCashCents : 0);
  const calmDashboardCopy =
    atRiskCashCents > 0
      ? 'Some expected income is uncertain, so it is shown separately from spendable cash.'
      : 'Expected income is on track based on the records you entered.';

  return {
    clearedCashCents,
    expectedCashCents,
    atRiskCashCents,
    spendablePlanningCashCents,
    lateCount,
    calmDashboardCopy,
  };
}
