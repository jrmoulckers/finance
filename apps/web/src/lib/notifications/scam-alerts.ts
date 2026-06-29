// SPDX-License-Identifier: BUSL-1.1

/**
 * Scam-focused unusual spending alerts.
 *
 * Pure detection functions: callers provide transactions and receive calm,
 * plain-language alerts with concrete next steps.
 */

import type { Transaction } from '../../kmp/bridge';
import type { AppNotification } from './types';
import { formatCentsForAlert } from './alert-engine';

export type ScamAlertRule =
  | 'unusually-large'
  | 'new-merchant'
  | 'possible-duplicate'
  | 'rapid-succession'
  | 'round-large-unfamiliar';

export interface ScamSpendingAlert {
  readonly id: string;
  readonly rule: ScamAlertRule;
  readonly title: string;
  readonly message: string;
  readonly nextStep: string;
  readonly severity: 'info' | 'warning';
  readonly transactionIds: readonly string[];
  readonly merchantName?: string;
  readonly amountCents?: number;
  readonly createdAt: string;
}

export interface ScamAlertDetectionOptions {
  readonly recentWindowDays?: number;
  readonly duplicateWindowHours?: number;
  readonly rapidWindowMinutes?: number;
  readonly rapidMinimumCharges?: number;
  readonly roundLargeMinimumCents?: number;
  readonly minimumCategoryHistory?: number;
}

const DEFAULT_RECENT_WINDOW_DAYS = 30;
const DEFAULT_DUPLICATE_WINDOW_HOURS = 24;
const DEFAULT_RAPID_WINDOW_MINUTES = 10;
const DEFAULT_RAPID_MINIMUM_CHARGES = 3;
const DEFAULT_ROUND_LARGE_MINIMUM_CENTS = 50000;
const DEFAULT_MINIMUM_CATEGORY_HISTORY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function normalizeMerchant(transaction: Transaction): { key: string; label: string } | null {
  const raw =
    transaction.counterpartyName ??
    transaction.payee ??
    transaction.statementDescription ??
    transaction.note ??
    null;

  if (raw === null) return null;

  const label = raw.trim();
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (key.length === 0) return null;

  return { key, label };
}

function parseTimestamp(value: string | undefined | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function transactionTimestampMs(transaction: Transaction): number {
  return (
    parseTimestamp(transaction.customFields?.transactionAt) ??
    parseTimestamp(transaction.customFields?.postedAt) ??
    parseTimestamp(transaction.customFields?.authorizedAt) ??
    parseTimestamp(transaction.customFields?.timestamp) ??
    parseTimestamp(transaction.createdAt) ??
    parseTimestamp(transaction.updatedAt) ??
    parseTimestamp(`${transaction.date}T12:00:00Z`) ??
    0
  );
}

function alertTimestamp(transactions: readonly Transaction[]): string {
  const latest = transactions.reduce<Transaction | null>((currentLatest, transaction) => {
    if (currentLatest === null) return transaction;
    return transactionTimestampMs(transaction) > transactionTimestampMs(currentLatest)
      ? transaction
      : currentLatest;
  }, null);

  return latest?.createdAt ?? latest?.updatedAt ?? latest?.date ?? new Date(0).toISOString();
}

function amountCents(transaction: Transaction): number {
  return Math.abs(transaction.amount.amount);
}

function categoryKey(transaction: Transaction): string {
  return transaction.categoryId ?? '__uncategorized__';
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[], average: number): number {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function isRoundLargeAmount(amount: number, minimumCents: number): boolean {
  return amount >= minimumCents && amount % 10000 === 0;
}

function buildMerchantMessage(amount: number, merchant: string, detail: string): string {
  return `We noticed a ${formatCentsForAlert(amount)} charge from "${merchant}" ${detail}.`;
}

function bankNextStep(): string {
  return "If you don't recognize it, call your bank using the number on your card.";
}

interface ExpenseRecord {
  readonly transaction: Transaction;
  readonly merchant: { key: string; label: string };
  readonly timestampMs: number;
}

/**
 * Detect unusual spending patterns that can indicate scams or accidental charges.
 */
export function detectScamAlerts(
  transactions: readonly Transaction[],
  options: ScamAlertDetectionOptions = {},
): ScamSpendingAlert[] {
  const recentWindowDays = options.recentWindowDays ?? DEFAULT_RECENT_WINDOW_DAYS;
  const duplicateWindowMs =
    (options.duplicateWindowHours ?? DEFAULT_DUPLICATE_WINDOW_HOURS) * HOUR_MS;
  const rapidWindowMs = (options.rapidWindowMinutes ?? DEFAULT_RAPID_WINDOW_MINUTES) * MINUTE_MS;
  const rapidMinimumCharges = options.rapidMinimumCharges ?? DEFAULT_RAPID_MINIMUM_CHARGES;
  const roundLargeMinimumCents =
    options.roundLargeMinimumCents ?? DEFAULT_ROUND_LARGE_MINIMUM_CENTS;
  const minimumCategoryHistory = options.minimumCategoryHistory ?? DEFAULT_MINIMUM_CATEGORY_HISTORY;

  const expenses: ExpenseRecord[] = transactions
    .filter((transaction) => transaction.type === 'EXPENSE' && transaction.status !== 'VOID')
    .map((transaction) => ({
      transaction,
      merchant: normalizeMerchant(transaction),
      timestampMs: transactionTimestampMs(transaction),
    }))
    .filter(
      (record): record is ExpenseRecord =>
        record.merchant !== null && amountCents(record.transaction) > 0,
    )
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (expenses.length === 0) return [];

  const latestTimestamp = expenses[expenses.length - 1]?.timestampMs ?? 0;
  const recentCutoff = latestTimestamp - recentWindowDays * DAY_MS;
  const alerts: ScamSpendingAlert[] = [];
  const seenAlertIds = new Set<string>();

  const addAlert = (alert: ScamSpendingAlert) => {
    if (seenAlertIds.has(alert.id)) return;
    seenAlertIds.add(alert.id);
    alerts.push(alert);
  };

  const seenMerchants = new Set<string>();
  const priorByCategory = new Map<string, number[]>();
  const priorByMerchantAndAmount = new Map<string, ExpenseRecord[]>();
  let priorExpenseCount = 0;

  for (const record of expenses) {
    const { transaction, merchant, timestampMs } = record;
    const amount = amountCents(transaction);
    const isRecent = timestampMs >= recentCutoff;
    const merchantHasHistory = seenMerchants.has(merchant.key);
    const categoryHistory = priorByCategory.get(categoryKey(transaction)) ?? [];

    if (isRecent && categoryHistory.length >= minimumCategoryHistory) {
      const average = mean(categoryHistory);
      const stdDev = standardDeviation(categoryHistory, average);
      const isThreeTimesAverage = average > 0 && amount > average * 3;
      const isTwoStdDevsHigh = stdDev > 0 && amount > average + stdDev * 2;

      if (isThreeTimesAverage || isTwoStdDevsHigh) {
        addAlert({
          id: `scam-large-${transaction.id}`,
          rule: 'unusually-large',
          title: 'Check this larger charge',
          message: buildMerchantMessage(
            amount,
            merchant.label,
            'that is higher than usual for this category',
          ),
          nextStep:
            'If it looks unfamiliar, compare it with your receipt or recent order history before paying more.',
          severity: 'warning',
          transactionIds: [transaction.id],
          merchantName: merchant.label,
          amountCents: amount,
          createdAt: transaction.createdAt,
        });
      }
    }

    const duplicateKey = `${merchant.key}|${amount}`;
    const possibleDuplicates = priorByMerchantAndAmount.get(duplicateKey) ?? [];
    const duplicate = possibleDuplicates.find(
      (prior) =>
        timestampMs - prior.timestampMs > 0 && timestampMs - prior.timestampMs <= duplicateWindowMs,
    );

    if (isRecent && duplicate !== undefined) {
      addAlert({
        id: `scam-duplicate-${duplicate.transaction.id}-${transaction.id}`,
        rule: 'possible-duplicate',
        title: 'Check for a duplicate charge',
        message: `We noticed two ${formatCentsForAlert(amount)} charges from "${merchant.label}" within 24 hours.`,
        nextStep:
          'If you only bought this once, contact the merchant or your bank to ask about the second charge.',
        severity: 'warning',
        transactionIds: [duplicate.transaction.id, transaction.id],
        merchantName: merchant.label,
        amountCents: amount,
        createdAt: alertTimestamp([duplicate.transaction, transaction]),
      });
    }

    if (isRecent && priorExpenseCount > 0 && !merchantHasHistory) {
      addAlert({
        id: `scam-new-merchant-${transaction.id}`,
        rule: 'new-merchant',
        title: 'New merchant to review',
        message: buildMerchantMessage(amount, merchant.label, 'which is new to you'),
        nextStep: bankNextStep(),
        severity: 'info',
        transactionIds: [transaction.id],
        merchantName: merchant.label,
        amountCents: amount,
        createdAt: transaction.createdAt,
      });
    }

    if (
      isRecent &&
      priorExpenseCount > 0 &&
      !merchantHasHistory &&
      isRoundLargeAmount(amount, roundLargeMinimumCents)
    ) {
      addAlert({
        id: `scam-round-large-${transaction.id}`,
        rule: 'round-large-unfamiliar',
        title: 'Check this round-number charge',
        message: buildMerchantMessage(
          amount,
          merchant.label,
          'which is new to you, and the amount is unusually large and round',
        ),
        nextStep: bankNextStep(),
        severity: 'warning',
        transactionIds: [transaction.id],
        merchantName: merchant.label,
        amountCents: amount,
        createdAt: transaction.createdAt,
      });
    }

    seenMerchants.add(merchant.key);
    priorExpenseCount += 1;
    priorByCategory.set(categoryKey(transaction), [...categoryHistory, amount]);
    priorByMerchantAndAmount.set(duplicateKey, [...possibleDuplicates, record]);
  }

  const byAccount = new Map<string, ExpenseRecord[]>();
  for (const record of expenses.filter((record) => record.timestampMs >= recentCutoff)) {
    byAccount.set(record.transaction.accountId, [
      ...(byAccount.get(record.transaction.accountId) ?? []),
      record,
    ]);
  }

  const rapidReportedIds = new Set<string>();
  for (const accountTransactions of byAccount.values()) {
    let startIndex = 0;
    for (let endIndex = 0; endIndex < accountTransactions.length; endIndex += 1) {
      const end = accountTransactions[endIndex];
      while (
        end !== undefined &&
        accountTransactions[startIndex] !== undefined &&
        end.timestampMs - accountTransactions[startIndex].timestampMs > rapidWindowMs
      ) {
        startIndex += 1;
      }

      const window = accountTransactions.slice(startIndex, endIndex + 1);
      if (
        window.length >= rapidMinimumCharges &&
        window.some((record) => !rapidReportedIds.has(record.transaction.id))
      ) {
        const ids = window.map((record) => record.transaction.id);
        ids.forEach((id) => rapidReportedIds.add(id));
        addAlert({
          id: `scam-rapid-${ids.join('-')}`,
          rule: 'rapid-succession',
          title: 'Several charges happened close together',
          message: `We noticed ${window.length} charges within ${Math.round(rapidWindowMs / MINUTE_MS)} minutes on this account.`,
          nextStep:
            'If you did not make these purchases, call your bank using the number on your card.',
          severity: 'warning',
          transactionIds: ids,
          createdAt: alertTimestamp(window.map((record) => record.transaction)),
        });
      }
    }
  }

  return alerts.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

/** Convert scam spending alerts into app notifications for the notification center. */
export function scamAlertsToNotifications(alerts: readonly ScamSpendingAlert[]): AppNotification[] {
  return alerts.map((alert) => ({
    id: alert.id,
    type: 'scam_check',
    severity: alert.severity,
    title: alert.title,
    message: `${alert.message} NEXT STEP: ${alert.nextStep}`,
    createdAt: alert.createdAt,
    status: 'unread',
    entityId: alert.transactionIds.length === 1 ? alert.transactionIds[0] : undefined,
    entityType: alert.transactionIds.length === 1 ? 'transaction' : undefined,
    actionLabel: alert.transactionIds.length === 1 ? 'Review transaction' : undefined,
    deduplicationKey: alert.id,
  }));
}
