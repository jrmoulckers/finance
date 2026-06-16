// SPDX-License-Identifier: BUSL-1.1

export interface DetectionTransaction {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly payee: string;
  readonly accountId?: string;
  readonly sourceId?: string;
  readonly importSource?: string;
  readonly type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
}

export interface LearnedDetectionThreshold {
  readonly accountId?: string;
  readonly importSource?: string;
  readonly duplicateThreshold?: number;
  readonly transferThreshold?: number;
}

export type ReviewAction = 'merge-duplicate' | 'link-transfer' | 'keep-separate' | 'ignore-suggestion';

export interface CandidateScore {
  readonly leftId: string;
  readonly rightId: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly recommendedAction: ReviewAction;
  readonly autoMergeAllowed: boolean;
}

export interface DuplicateTransferDetectionResult {
  readonly duplicateCandidates: readonly CandidateScore[];
  readonly transferCandidates: readonly CandidateScore[];
}

export interface DetectionOptions {
  readonly duplicateThreshold?: number;
  readonly transferThreshold?: number;
  readonly autoMergeThreshold?: number;
  readonly dateWindowDays?: number;
}

const DEFAULTS = {
  duplicateThreshold: 0.72,
  transferThreshold: 0.68,
  autoMergeThreshold: 0.94,
  dateWindowDays: 3,
};

export function scoreDuplicateCandidate(
  left: DetectionTransaction,
  right: DetectionTransaction,
  learnedThresholds: readonly LearnedDetectionThreshold[] = [],
): CandidateScore {
  const reasons: string[] = [];
  let score = 0;
  if (left.sourceId && right.sourceId && left.sourceId === right.sourceId) {
    score += 0.42;
    reasons.push('same source id');
  }
  if (left.amountCents === right.amountCents) {
    score += 0.25;
    reasons.push('exact amount');
  }
  const days = Math.abs(daysBetween(left.date, right.date));
  if (days === 0) {
    score += 0.18;
    reasons.push('same date');
  } else if (days <= 2) {
    score += 0.12;
    reasons.push('nearby date');
  }
  const nameScore = tokenSimilarity(normalizePayee(left.payee), normalizePayee(right.payee));
  score += nameScore * 0.18;
  if (nameScore >= 0.75) reasons.push('similar normalized payee');
  if (left.accountId !== undefined && left.accountId === right.accountId) {
    score += 0.08;
    reasons.push('same account');
  }
  const learned = learnedThresholdFor(left, learnedThresholds).duplicateThreshold;
  const confidence = clamp(score + (learned !== undefined && learned < DEFAULTS.duplicateThreshold ? 0.03 : 0));
  return {
    leftId: left.id,
    rightId: right.id,
    confidence,
    reasons,
    recommendedAction: confidence >= DEFAULTS.duplicateThreshold ? 'merge-duplicate' : 'keep-separate',
    autoMergeAllowed: confidence >= DEFAULTS.autoMergeThreshold,
  };
}

export function scoreTransferCandidate(
  debit: DetectionTransaction,
  credit: DetectionTransaction,
  learnedThresholds: readonly LearnedDetectionThreshold[] = [],
): CandidateScore {
  const reasons: string[] = [];
  let score = 0;
  if (debit.amountCents + credit.amountCents === 0) {
    score += 0.34;
    reasons.push('opposite exact amounts');
  }
  const days = Math.abs(daysBetween(debit.date, credit.date));
  if (days <= 1) {
    score += 0.2;
    reasons.push('posted within one day');
  } else if (days <= 3) {
    score += 0.12;
    reasons.push('posted within transfer window');
  }
  if (debit.accountId && credit.accountId && debit.accountId !== credit.accountId) {
    score += 0.18;
    reasons.push('different accounts');
  }
  const text = `${debit.payee} ${credit.payee}`.toLowerCase();
  if (/transfer|xfer|online banking|payment to|payment from|savings|checking/.test(text)) {
    score += 0.16;
    reasons.push('transfer wording or account hint');
  }
  const nameScore = tokenSimilarity(normalizePayee(debit.payee), normalizePayee(credit.payee));
  if (nameScore >= 0.55) {
    score += 0.06;
    reasons.push('compatible payee text');
  }
  if (looksLikeRefundOrPayroll(debit, credit)) {
    score -= 0.22;
    reasons.push('refund or payroll guardrail');
  }
  const learned = learnedThresholdFor(debit, learnedThresholds).transferThreshold;
  const confidence = clamp(score + (learned !== undefined && learned < DEFAULTS.transferThreshold ? 0.03 : 0));
  return {
    leftId: debit.id,
    rightId: credit.id,
    confidence,
    reasons,
    recommendedAction: confidence >= DEFAULTS.transferThreshold ? 'link-transfer' : 'keep-separate',
    autoMergeAllowed: false,
  };
}

export function detectDuplicateAndTransferCandidates(
  imported: readonly DetectionTransaction[],
  existing: readonly DetectionTransaction[],
  options: DetectionOptions = {},
  learnedThresholds: readonly LearnedDetectionThreshold[] = [],
): DuplicateTransferDetectionResult {
  const config = { ...DEFAULTS, ...options };
  const duplicateCandidates: CandidateScore[] = [];
  const transferCandidates: CandidateScore[] = [];

  for (const candidate of imported) {
    for (const transaction of existing) {
      if (Math.abs(daysBetween(candidate.date, transaction.date)) > config.dateWindowDays) continue;
      const duplicate = scoreDuplicateCandidate(candidate, transaction, learnedThresholds);
      if (duplicate.confidence >= config.duplicateThreshold) duplicateCandidates.push(duplicate);

      if (candidate.amountCents * transaction.amountCents < 0) {
        const debit = candidate.amountCents < 0 ? candidate : transaction;
        const credit = candidate.amountCents > 0 ? candidate : transaction;
        const transfer = scoreTransferCandidate(debit, credit, learnedThresholds);
        if (transfer.confidence >= config.transferThreshold) transferCandidates.push(transfer);
      }
    }
  }

  return {
    duplicateCandidates: duplicateCandidates.sort((a, b) => b.confidence - a.confidence),
    transferCandidates: transferCandidates.sort((a, b) => b.confidence - a.confidence),
  };
}

export function learnDetectionDecision(
  decision: ReviewAction,
  transaction: DetectionTransaction,
  existing: readonly LearnedDetectionThreshold[] = [],
): LearnedDetectionThreshold[] {
  const index = existing.findIndex(
    (entry) => entry.accountId === transaction.accountId && entry.importSource === transaction.importSource,
  );
  const current = index >= 0 ? existing[index] : { accountId: transaction.accountId, importSource: transaction.importSource };
  const adjustment = decision === 'keep-separate' || decision === 'ignore-suggestion' ? 0.04 : -0.03;
  const next: LearnedDetectionThreshold = {
    ...current,
    duplicateThreshold: clampThreshold((current.duplicateThreshold ?? DEFAULTS.duplicateThreshold) + adjustment),
    transferThreshold: clampThreshold((current.transferThreshold ?? DEFAULTS.transferThreshold) + adjustment),
  };
  if (index < 0) return [...existing, next];
  return existing.map((entry, entryIndex) => (entryIndex === index ? next : entry));
}

function learnedThresholdFor(
  transaction: DetectionTransaction,
  thresholds: readonly LearnedDetectionThreshold[],
): LearnedDetectionThreshold {
  return (
    thresholds.find(
      (entry) => entry.accountId === transaction.accountId && entry.importSource === transaction.importSource,
    ) ?? {}
  );
}

function looksLikeRefundOrPayroll(left: DetectionTransaction, right: DetectionTransaction): boolean {
  const text = `${left.payee} ${right.payee}`.toLowerCase();
  return /refund|return|reversal|payroll|salary|paycheck/.test(text);
}

function normalizePayee(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pos|debit|credit|ach|transfer|xfer|online|payment|from|to)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function daysBetween(leftDate: string, rightDate: string): number {
  return Math.round((Date.parse(leftDate) - Date.parse(rightDate)) / 86_400_000);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function clampThreshold(value: number): number {
  return Math.max(0.5, Math.min(0.98, Number(value.toFixed(2))));
}
