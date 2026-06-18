// SPDX-License-Identifier: BUSL-1.1

import type { Transaction } from '../../kmp/bridge';

export type FinancialAnomalyKind =
  | 'category-outlier'
  | 'merchant-drift'
  | 'unusual-timing'
  | 'velocity-spike'
  | 'recurring-deviation';

export type AnomalyDisposition = 'expected' | 'suspicious' | 'dismissed';

export interface AnomalyFeedback {
  readonly transactionId?: string;
  readonly merchantKey?: string;
  readonly categoryId?: string | null;
  readonly kind?: FinancialAnomalyKind;
  readonly disposition: AnomalyDisposition;
}

export interface FinancialAnomaly {
  readonly id: string;
  readonly kind: FinancialAnomalyKind;
  readonly severity: 'low' | 'medium' | 'high';
  readonly confidence: number;
  readonly transactionIds: readonly string[];
  readonly explanation: string;
  readonly comparableExamples: readonly string[];
  readonly merchantName?: string;
  readonly amountCents?: number;
}

export interface DetectFinancialAnomaliesOptions {
  readonly minimumCategoryHistory?: number;
  readonly minimumMerchantHistory?: number;
  readonly velocityWindowDays?: number;
  readonly velocityMinimumCount?: number;
  readonly minimumConfidence?: number;
}

interface ExpenseRecord {
  readonly transaction: Transaction;
  readonly amountCents: number;
  readonly merchantKey: string;
  readonly merchantLabel: string;
  readonly timestampMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeMerchant(transaction: Transaction): { key: string; label: string } {
  const raw =
    transaction.counterpartyName ??
    transaction.payee ??
    transaction.statementDescription ??
    transaction.note ??
    'Unknown merchant';
  const label = raw.trim() || 'Unknown merchant';
  const key =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim() || 'unknown merchant';
  return { key, label };
}

function timestampMs(transaction: Transaction): number {
  const raw =
    transaction.customFields?.transactionAt ??
    transaction.customFields?.postedAt ??
    transaction.customFields?.authorizedAt ??
    transaction.createdAt ??
    `${transaction.date}T12:00:00Z`;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Date.parse(`${transaction.date}T12:00:00Z`) : parsed;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function robustZScore(value: number, history: readonly number[]): number {
  const center = median(history);
  const mad = median(history.map((item) => Math.abs(item - center)));
  if (mad === 0) return center === 0 ? 0 : Math.abs(value - center) / Math.max(1, center);
  return Math.abs(value - center) / (mad * 1.4826);
}

function categoryKey(transaction: Transaction): string {
  return transaction.categoryId ?? '__uncategorized__';
}

function severityFor(score: number, amountCents: number): FinancialAnomaly['severity'] {
  if (score >= 0.85 || amountCents >= 100_000) return 'high';
  if (score >= 0.65 || amountCents >= 25_000) return 'medium';
  return 'low';
}

function comparable(history: readonly number[], label = 'typical'): string[] {
  if (history.length === 0) return [];
  return [`${label} amount is about ${Math.round(median(history) / 100)} dollars`];
}

function feedbackKey(feedback: AnomalyFeedback): string {
  return `${feedback.kind ?? '*'}|${feedback.transactionId ?? '*'}|${feedback.merchantKey ?? '*'}|${feedback.categoryId ?? '*'}`;
}

function appliesFeedback(
  feedback: AnomalyFeedback,
  kind: FinancialAnomalyKind,
  record: ExpenseRecord,
): boolean {
  return (
    (feedback.kind === undefined || feedback.kind === kind) &&
    (feedback.transactionId === undefined || feedback.transactionId === record.transaction.id) &&
    (feedback.merchantKey === undefined || feedback.merchantKey === record.merchantKey) &&
    (feedback.categoryId === undefined || feedback.categoryId === record.transaction.categoryId)
  );
}

function adjustedConfidence(
  base: number,
  kind: FinancialAnomalyKind,
  record: ExpenseRecord,
  feedback: readonly AnomalyFeedback[],
): number {
  let score = base;
  for (const item of feedback) {
    if (!appliesFeedback(item, kind, record)) continue;
    if (item.disposition === 'expected') score -= 0.25;
    if (item.disposition === 'dismissed') score -= 0.5;
    if (item.disposition === 'suspicious') score += 0.15;
  }
  return Math.max(0, Math.min(1, score));
}

function shouldSuppress(
  kind: FinancialAnomalyKind,
  record: ExpenseRecord,
  feedback: readonly AnomalyFeedback[],
): boolean {
  return feedback.some(
    (item) => item.disposition === 'dismissed' && appliesFeedback(item, kind, record),
  );
}

function pushAnomaly(
  anomalies: FinancialAnomaly[],
  seen: Set<string>,
  anomaly: FinancialAnomaly,
  minimumConfidence: number,
): void {
  if (anomaly.confidence < minimumConfidence || seen.has(anomaly.id)) return;
  seen.add(anomaly.id);
  anomalies.push(anomaly);
}

export function detectFinancialAnomalies(
  transactions: readonly Transaction[],
  feedback: readonly AnomalyFeedback[] = [],
  options: DetectFinancialAnomaliesOptions = {},
): FinancialAnomaly[] {
  const minimumCategoryHistory = options.minimumCategoryHistory ?? 5;
  const minimumMerchantHistory = options.minimumMerchantHistory ?? 3;
  const velocityWindowDays = options.velocityWindowDays ?? 1;
  const velocityMinimumCount = options.velocityMinimumCount ?? 4;
  const minimumConfidence = options.minimumConfidence ?? 0.45;
  const anomalies: FinancialAnomaly[] = [];
  const seen = new Set<string>();
  const ignoredFeedback = new Set(feedback.map(feedbackKey));
  void ignoredFeedback;

  const expenses = transactions
    .filter(
      (transaction) =>
        transaction.status !== 'VOID' &&
        transaction.type === 'EXPENSE' &&
        transaction.amount.amount !== 0,
    )
    .map((transaction): ExpenseRecord => {
      const merchant = normalizeMerchant(transaction);
      return {
        transaction,
        amountCents: Math.abs(transaction.amount.amount),
        merchantKey: merchant.key,
        merchantLabel: merchant.label,
        timestampMs: timestampMs(transaction),
      };
    })
    .sort((left, right) => left.timestampMs - right.timestampMs);

  const categoryHistory = new Map<string, number[]>();
  const merchantHistory = new Map<string, number[]>();
  const recurringHistory = new Map<string, number[]>();

  for (const record of expenses) {
    const categoryAmounts = categoryHistory.get(categoryKey(record.transaction)) ?? [];
    if (categoryAmounts.length >= minimumCategoryHistory) {
      const zScore = robustZScore(record.amountCents, categoryAmounts);
      if (zScore >= 3.2 && !shouldSuppress('category-outlier', record, feedback)) {
        const confidence = adjustedConfidence(
          Math.min(0.95, 0.45 + zScore / 8),
          'category-outlier',
          record,
          feedback,
        );
        pushAnomaly(
          anomalies,
          seen,
          {
            id: `category-outlier-${record.transaction.id}`,
            kind: 'category-outlier',
            severity: severityFor(confidence, record.amountCents),
            confidence,
            transactionIds: [record.transaction.id],
            explanation: `${record.merchantLabel} is much higher than your usual spending in this category.`,
            comparableExamples: comparable(categoryAmounts, 'category'),
            merchantName: record.merchantLabel,
            amountCents: record.amountCents,
          },
          minimumConfidence,
        );
      }
    }

    const merchantAmounts = merchantHistory.get(record.merchantKey) ?? [];
    if (merchantAmounts.length === 0 && expenses.indexOf(record) >= minimumMerchantHistory) {
      const confidence = adjustedConfidence(0.52, 'merchant-drift', record, feedback);
      if (!shouldSuppress('merchant-drift', record, feedback)) {
        pushAnomaly(
          anomalies,
          seen,
          {
            id: `merchant-drift-${record.transaction.id}`,
            kind: 'merchant-drift',
            severity: severityFor(confidence, record.amountCents),
            confidence,
            transactionIds: [record.transaction.id],
            explanation: `${record.merchantLabel} has not appeared in your prior local history.`,
            comparableExamples: ['Compare this merchant with recent receipts or subscriptions.'],
            merchantName: record.merchantLabel,
            amountCents: record.amountCents,
          },
          minimumConfidence,
        );
      }
    } else if (merchantAmounts.length >= minimumMerchantHistory) {
      const zScore = robustZScore(record.amountCents, merchantAmounts);
      if (zScore >= 2.8 && !shouldSuppress('merchant-drift', record, feedback)) {
        const confidence = adjustedConfidence(
          Math.min(0.92, 0.4 + zScore / 7),
          'merchant-drift',
          record,
          feedback,
        );
        pushAnomaly(
          anomalies,
          seen,
          {
            id: `merchant-drift-${record.transaction.id}`,
            kind: 'merchant-drift',
            severity: severityFor(confidence, record.amountCents),
            confidence,
            transactionIds: [record.transaction.id],
            explanation: `${record.merchantLabel} is outside its normal charge pattern.`,
            comparableExamples: comparable(merchantAmounts, 'merchant'),
            merchantName: record.merchantLabel,
            amountCents: record.amountCents,
          },
          minimumConfidence,
        );
      }
    }

    const hour = new Date(record.timestampMs).getUTCHours();
    if ((hour < 5 || hour > 23) && !shouldSuppress('unusual-timing', record, feedback)) {
      const confidence = adjustedConfidence(0.58, 'unusual-timing', record, feedback);
      pushAnomaly(
        anomalies,
        seen,
        {
          id: `unusual-timing-${record.transaction.id}`,
          kind: 'unusual-timing',
          severity: severityFor(confidence, record.amountCents),
          confidence,
          transactionIds: [record.transaction.id],
          explanation: `${record.merchantLabel} posted at an unusual time for routine spending.`,
          comparableExamples: ['Most card activity is expected during waking hours.'],
          merchantName: record.merchantLabel,
          amountCents: record.amountCents,
        },
        minimumConfidence,
      );
    }

    const recurringKey = record.transaction.recurringRuleId ?? null;
    if (recurringKey !== null) {
      const prior = recurringHistory.get(recurringKey) ?? [];
      if (prior.length >= 2) {
        const medianAmount = median(prior);
        const delta = Math.abs(record.amountCents - medianAmount);
        if (
          medianAmount > 0 &&
          delta / medianAmount >= 0.25 &&
          !shouldSuppress('recurring-deviation', record, feedback)
        ) {
          const confidence = adjustedConfidence(
            Math.min(0.9, 0.5 + delta / medianAmount / 2),
            'recurring-deviation',
            record,
            feedback,
          );
          pushAnomaly(
            anomalies,
            seen,
            {
              id: `recurring-deviation-${record.transaction.id}`,
              kind: 'recurring-deviation',
              severity: severityFor(confidence, record.amountCents),
              confidence,
              transactionIds: [record.transaction.id],
              explanation: `${record.merchantLabel} differs from its usual recurring amount.`,
              comparableExamples: comparable(prior, 'recurring'),
              merchantName: record.merchantLabel,
              amountCents: record.amountCents,
            },
            minimumConfidence,
          );
        }
      }
      recurringHistory.set(recurringKey, [...prior, record.amountCents]);
    }

    categoryHistory.set(categoryKey(record.transaction), [...categoryAmounts, record.amountCents]);
    merchantHistory.set(record.merchantKey, [...merchantAmounts, record.amountCents]);
  }

  for (let index = 0; index < expenses.length; index += 1) {
    const anchor = expenses[index];
    if (!anchor) continue;
    const windowEnd = anchor.timestampMs + velocityWindowDays * DAY_MS;
    const cluster = expenses.filter(
      (record) => record.timestampMs >= anchor.timestampMs && record.timestampMs <= windowEnd,
    );
    if (cluster.length >= velocityMinimumCount) {
      const total = cluster.reduce((sum, record) => sum + record.amountCents, 0);
      const confidence = Math.min(0.93, 0.5 + cluster.length / 10 + total / 1_000_000);
      pushAnomaly(
        anomalies,
        seen,
        {
          id: `velocity-spike-${anchor.transaction.date}`,
          kind: 'velocity-spike',
          severity: severityFor(confidence, total),
          confidence,
          transactionIds: cluster.map((record) => record.transaction.id),
          explanation: `${cluster.length} expenses posted in a short window, which is faster than usual activity.`,
          comparableExamples: [`Combined amount is ${Math.round(total / 100)} dollars.`],
          amountCents: total,
        },
        minimumConfidence,
      );
      break;
    }
  }

  return anomalies.sort((left, right) => right.confidence - left.confidence);
}
