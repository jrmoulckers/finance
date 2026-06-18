// SPDX-License-Identifier: BUSL-1.1

export type BillCadence = 'weekly' | 'biweekly' | 'monthly' | 'annual' | 'irregular';
export type BillCandidateStatus = 'candidate' | 'confirmed' | 'ignored';

export interface BillTransaction {
  readonly id: string;
  readonly merchant: string;
  readonly date: string;
  readonly amountCents: number;
  readonly type?: 'expense' | 'income' | 'transfer';
  readonly category?: string;
}

export interface BillCandidate {
  readonly id: string;
  readonly merchant: string;
  readonly cadence: BillCadence;
  readonly nextDueDate: string;
  readonly expectedAmountRangeCents: readonly [number, number];
  readonly confidence: number;
  readonly sourceTransactionIds: readonly string[];
  readonly status: BillCandidateStatus;
}

export interface BillUserDecision {
  readonly candidateId: string;
  readonly action: 'confirm' | 'edit' | 'ignore' | 'merge';
  readonly changes?: Partial<
    Pick<BillCandidate, 'merchant' | 'nextDueDate' | 'expectedAmountRangeCents' | 'cadence'>
  >;
  readonly mergeIntoId?: string;
}

export interface BillNotification {
  readonly candidateId: string;
  readonly type: 'bill_due' | 'projected_low_balance';
  readonly deduplicationKey: string;
  readonly dueDate: string;
  readonly message: string;
}

export interface BillNotificationOptions {
  readonly today: string;
  readonly confidenceThreshold: number;
  readonly leadDays: number;
  readonly existingDeduplicationKeys?: readonly string[];
  readonly projectedBalanceCents?: number;
  readonly lowBalanceThresholdCents?: number;
}

export function detectBillCandidates(transactions: readonly BillTransaction[]): BillCandidate[] {
  const groups = new Map<string, BillTransaction[]>();
  for (const transaction of transactions) {
    if ((transaction.type ?? 'expense') !== 'expense') continue;
    if (transaction.amountCents >= 0) continue;
    const key = normalizeMerchant(transaction.merchant);
    const values = groups.get(key) ?? [];
    values.push(transaction);
    groups.set(key, values);
  }

  return [...groups.entries()]
    .flatMap(([key, values]) => buildCandidate(key, values))
    .sort(
      (left, right) =>
        right.confidence - left.confidence || left.nextDueDate.localeCompare(right.nextDueDate),
    );
}

function buildCandidate(key: string, transactions: readonly BillTransaction[]): BillCandidate[] {
  const sorted = [...transactions].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length < 2) return [];
  const amounts = sorted.map((transaction) => Math.abs(transaction.amountCents));
  const intervals = sorted
    .slice(1)
    .map((transaction, index) => daysBetween(sorted[index].date, transaction.date));
  const cadence = classifyCadence(intervals);
  if (!cadence) return [];
  const interval = cadenceDays(cadence, median(intervals));
  const last = sorted[sorted.length - 1];
  const amountSpread = Math.max(...amounts) - Math.min(...amounts);
  const average = Math.round(mean(amounts));
  const range: readonly [number, number] = [
    Math.max(0, Math.min(...amounts) - Math.round(amountSpread * 0.1)),
    Math.max(...amounts) + Math.round(amountSpread * 0.1),
  ];
  const cadenceScore = cadence === 'irregular' ? 0.35 : 0.6;
  const amountScore = Math.max(0, 0.25 - amountSpread / Math.max(average, 1) / 2);
  const countScore = Math.min(0.15, sorted.length * 0.03);
  const categoryScore = /bill|utilities|rent|insurance|loan|subscription/iu.test(
    sorted.map((item) => item.category ?? '').join(' '),
  )
    ? 0.1
    : 0;
  return [
    {
      id: `bill-${key}`,
      merchant: titleCase(key),
      cadence,
      nextDueDate: addDays(last.date, interval),
      expectedAmountRangeCents: range,
      confidence: round(cadenceScore + amountScore + countScore + categoryScore),
      sourceTransactionIds: sorted.map((transaction) => transaction.id),
      status: 'candidate',
    },
  ];
}

export function classifyCadence(intervals: readonly number[]): BillCadence | undefined {
  if (intervals.length === 0) return undefined;
  const typical = median(intervals);
  const tolerance =
    intervals.filter((interval) => Math.abs(interval - typical) <= Math.max(3, typical * 0.15))
      .length / intervals.length;
  if (near(typical, 7, 2) && tolerance >= 0.6) return 'weekly';
  if (near(typical, 14, 3) && tolerance >= 0.6) return 'biweekly';
  if (near(typical, 30, 5) && tolerance >= 0.55) return 'monthly';
  if (near(typical, 365, 20) && tolerance >= 0.5) return 'annual';
  if (intervals.length >= 2 && typical >= 20 && typical <= 75) return 'irregular';
  return undefined;
}

export function applyBillCandidateDecision(
  candidates: readonly BillCandidate[],
  decision: BillUserDecision,
): BillCandidate[] {
  if (decision.action === 'merge' && decision.mergeIntoId) {
    const source = candidates.find((candidate) => candidate.id === decision.candidateId);
    return candidates
      .filter((candidate) => candidate.id !== decision.candidateId)
      .map((candidate) => {
        if (candidate.id !== decision.mergeIntoId || !source) return candidate;
        return {
          ...candidate,
          sourceTransactionIds: [
            ...new Set([...candidate.sourceTransactionIds, ...source.sourceTransactionIds]),
          ],
          confidence: Math.max(candidate.confidence, source.confidence),
        };
      });
  }

  return candidates.map((candidate) => {
    if (candidate.id !== decision.candidateId) return candidate;
    if (decision.action === 'ignore') return { ...candidate, status: 'ignored' };
    if (decision.action === 'confirm') return { ...candidate, status: 'confirmed' };
    return { ...candidate, ...decision.changes, status: 'confirmed' };
  });
}

export function generateBillNotifications(
  candidates: readonly BillCandidate[],
  options: BillNotificationOptions,
): BillNotification[] {
  const seen = new Set(options.existingDeduplicationKeys ?? []);
  const threshold = options.lowBalanceThresholdCents ?? 0;
  return candidates.flatMap((candidate) => {
    if (candidate.status === 'ignored' || candidate.confidence < options.confidenceThreshold)
      return [];
    const daysUntilDue = daysBetween(options.today, candidate.nextDueDate);
    if (daysUntilDue < 0 || daysUntilDue > options.leadDays) return [];
    const dueKey = `${candidate.id}:${candidate.nextDueDate}:bill_due`;
    const averageAmount = Math.round(mean([...candidate.expectedAmountRangeCents]));
    const notifications: BillNotification[] = [];
    if (!seen.has(dueKey)) {
      notifications.push({
        candidateId: candidate.id,
        type: 'bill_due',
        deduplicationKey: dueKey,
        dueDate: candidate.nextDueDate,
        message: `${candidate.merchant} is expected in ${daysUntilDue} day(s).`,
      });
    }
    const projected = (options.projectedBalanceCents ?? Number.POSITIVE_INFINITY) - averageAmount;
    const balanceKey = `${candidate.id}:${candidate.nextDueDate}:projected_low_balance`;
    if (projected < threshold && !seen.has(balanceKey)) {
      notifications.push({
        candidateId: candidate.id,
        type: 'projected_low_balance',
        deduplicationKey: balanceKey,
        dueDate: candidate.nextDueDate,
        message: `${candidate.merchant} may leave the account below the configured threshold.`,
      });
    }
    return notifications;
  });
}

function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\b(inc|llc|co|autopay|payment)\b/gu, '')
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

function near(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length % 2 === 0
    ? mean([sorted[sorted.length / 2 - 1], sorted[sorted.length / 2]])
    : sorted[Math.floor(sorted.length / 2)];
}

function cadenceDays(cadence: BillCadence, fallback: number): number {
  if (cadence === 'weekly') return 7;
  if (cadence === 'biweekly') return 14;
  if (cadence === 'monthly') return 30;
  if (cadence === 'annual') return 365;
  return fallback;
}

function round(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
