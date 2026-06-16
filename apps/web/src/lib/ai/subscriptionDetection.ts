// SPDX-License-Identifier: BUSL-1.1

export type SubscriptionCadence = 'monthly' | 'annual' | 'weekly' | 'trial_conversion';
export type SubscriptionStatus = 'candidate' | 'confirmed' | 'dismissed' | 'cancelled';

export interface SubscriptionTransaction {
  readonly id: string;
  readonly merchant: string;
  readonly date: string;
  readonly amountCents: number;
  readonly category?: string;
}

export interface SubscriptionPricePoint {
  readonly transactionId: string;
  readonly date: string;
  readonly amountCents: number;
}

export interface SubscriptionPriceChange {
  readonly priorAmountCents: number;
  readonly newAmountCents: number;
  readonly deltaCents: number;
  readonly percentDelta: number;
  readonly annualImpactCents: number;
  readonly effectiveDate: string;
  readonly acknowledged: boolean;
}

export interface SubscriptionCandidate {
  readonly id: string;
  readonly merchant: string;
  readonly cadence: SubscriptionCadence;
  readonly nextChargeDate: string;
  readonly annualizedCostCents: number;
  readonly confidence: number;
  readonly status: SubscriptionStatus;
  readonly priceHistory: readonly SubscriptionPricePoint[];
  readonly priceChanges: readonly SubscriptionPriceChange[];
}

export interface SubscriptionDecision {
  readonly candidateId: string;
  readonly action: 'confirm' | 'rename' | 'merge' | 'dismiss' | 'cancel' | 'acknowledge-price-change';
  readonly name?: string;
  readonly mergeIntoId?: string;
  readonly effectiveDate?: string;
}

export function normalizeSubscriptionMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(subscription|monthly|annual|trial|inc|llc|co|payment|autopay)\b/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

export function detectSubscriptions(transactions: readonly SubscriptionTransaction[]): SubscriptionCandidate[] {
  const groups = new Map<string, SubscriptionTransaction[]>();
  for (const transaction of transactions) {
    if (transaction.amountCents >= 0) continue;
    const key = normalizeSubscriptionMerchant(transaction.merchant);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  return [...groups.entries()].flatMap(([merchant, group]) => buildSubscription(merchant, group)).sort((left, right) => right.confidence - left.confidence);
}

function buildSubscription(merchantKey: string, group: readonly SubscriptionTransaction[]): SubscriptionCandidate[] {
  const sorted = [...group].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length < 2) return [];
  const intervals = sorted.slice(1).map((transaction, index) => daysBetween(sorted[index].date, transaction.date));
  const amounts = sorted.map((transaction) => Math.abs(transaction.amountCents));
  const cadence = detectSubscriptionCadence(intervals, amounts);
  if (!cadence) return [];
  const last = sorted[sorted.length - 1];
  const latestAmount = Math.abs(last.amountCents);
  const priceHistory = sorted.map((transaction) => ({ transactionId: transaction.id, date: transaction.date, amountCents: Math.abs(transaction.amountCents) }));
  const priceChanges = detectPriceChanges(priceHistory, cadence);
  const countScore = Math.min(0.2, sorted.length * 0.04);
  const cadenceScore = cadence === 'trial_conversion' ? 0.55 : 0.6;
  const categoryScore = /subscription|software|streaming|membership/iu.test(sorted.map((item) => item.category ?? '').join(' ')) ? 0.1 : 0;
  return [
    {
      id: `sub-${merchantKey}`,
      merchant: titleCase(merchantKey),
      cadence,
      nextChargeDate: addDays(last.date, cadenceDays(cadence, median(intervals))),
      annualizedCostCents: annualize(latestAmount, cadence),
      confidence: round(cadenceScore + countScore + categoryScore),
      status: 'candidate',
      priceHistory,
      priceChanges,
    },
  ];
}

export function detectSubscriptionCadence(intervals: readonly number[], amounts: readonly number[]): SubscriptionCadence | undefined {
  if (amounts.length >= 2 && Math.min(...amounts) <= Math.max(...amounts) * 0.25 && intervals.some((interval) => interval >= 5 && interval <= 45)) return 'trial_conversion';
  const typical = median(intervals);
  if (near(typical, 7, 2)) return 'weekly';
  if (near(typical, 30, 5)) return 'monthly';
  if (near(typical, 365, 20)) return 'annual';
  return undefined;
}

export function detectPriceChanges(history: readonly SubscriptionPricePoint[], cadence: SubscriptionCadence): SubscriptionPriceChange[] {
  return history.slice(1).flatMap((point, index) => {
    const prior = history[index];
    const delta = point.amountCents - prior.amountCents;
    const percent = prior.amountCents > 0 ? delta / prior.amountCents : 0;
    if (Math.abs(delta) < 100 && Math.abs(percent) < 0.1) return [];
    return [
      {
        priorAmountCents: prior.amountCents,
        newAmountCents: point.amountCents,
        deltaCents: delta,
        percentDelta: Number((percent * 100).toFixed(1)),
        annualImpactCents: annualize(delta, cadence),
        effectiveDate: point.date,
        acknowledged: false,
      },
    ];
  });
}

export function applySubscriptionDecision(candidates: readonly SubscriptionCandidate[], decision: SubscriptionDecision): SubscriptionCandidate[] {
  if (decision.action === 'merge' && decision.mergeIntoId) {
    const source = candidates.find((candidate) => candidate.id === decision.candidateId);
    return candidates
      .filter((candidate) => candidate.id !== decision.candidateId)
      .map((candidate) => {
        if (candidate.id !== decision.mergeIntoId || !source) return candidate;
        const history = [...candidate.priceHistory, ...source.priceHistory].sort((left, right) => left.date.localeCompare(right.date));
        return { ...candidate, priceHistory: history, priceChanges: detectPriceChanges(history, candidate.cadence), confidence: Math.max(candidate.confidence, source.confidence) };
      });
  }

  return candidates.map((candidate) => {
    if (candidate.id !== decision.candidateId) return candidate;
    if (decision.action === 'confirm') return { ...candidate, status: 'confirmed' };
    if (decision.action === 'rename' && decision.name) return { ...candidate, merchant: decision.name, status: 'confirmed' };
    if (decision.action === 'dismiss') return { ...candidate, status: 'dismissed' };
    if (decision.action === 'cancel') return { ...candidate, status: 'cancelled' };
    if (decision.action === 'acknowledge-price-change') {
      return {
        ...candidate,
        priceChanges: candidate.priceChanges.map((change) => (change.effectiveDate === decision.effectiveDate ? { ...change, acknowledged: true } : change)),
      };
    }
    return candidate;
  });
}

export function priceChangeAlerts(candidates: readonly SubscriptionCandidate[], lastAlertedKeys: readonly string[] = []): readonly { readonly subscriptionId: string; readonly key: string; readonly change: SubscriptionPriceChange }[] {
  const alerted = new Set(lastAlertedKeys);
  return candidates.flatMap((candidate) => {
    if (candidate.status === 'dismissed' || candidate.status === 'cancelled') return [];
    return candidate.priceChanges.flatMap((change) => {
      const key = `${candidate.id}:${change.effectiveDate}:${change.newAmountCents}`;
      return change.acknowledged || alerted.has(key) ? [] : [{ subscriptionId: candidate.id, key, change }];
    });
  });
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 30;
  return sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
}

function near(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function cadenceDays(cadence: SubscriptionCadence, fallback: number): number {
  if (cadence === 'weekly') return 7;
  if (cadence === 'annual') return 365;
  return cadence === 'monthly' || cadence === 'trial_conversion' ? 30 : fallback;
}

function annualize(amountCents: number, cadence: SubscriptionCadence): number {
  if (cadence === 'weekly') return amountCents * 52;
  if (cadence === 'annual') return amountCents;
  return amountCents * 12;
}

function titleCase(value: string): string {
  return value.split(' ').filter(Boolean).map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

function round(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
