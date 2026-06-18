// SPDX-License-Identifier: BUSL-1.1

/**
 * Saved import profile and re-import planning helpers.
 * References: #2272.
 */

export type ImportDuplicatePolicy = 'skip' | 'review' | 'keep_both';
export type ImportProfileCadenceKind = 'manual' | 'daily' | 'weekly' | 'monthly';
export type ImportRunStatus = 'pending' | 'needs_review' | 'completed' | 'failed';

export interface ImportProfileCadence {
  readonly kind: ImportProfileCadenceKind;
  readonly interval: number;
  readonly dayOfWeek?: number;
  readonly dayOfMonth?: number;
}

export interface SavedImportProfile {
  readonly id: string;
  readonly name: string;
  readonly sourceFormat: string;
  readonly mappingFingerprint: string;
  readonly accountRoutingFingerprint: string | null;
  readonly duplicatePolicy: ImportDuplicatePolicy;
  readonly cadence: ImportProfileCadence;
  readonly remindersEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastRunAt: string | null;
}

export interface CreateImportProfileInput {
  readonly name: string;
  readonly sourceFormat: string;
  readonly headers: readonly string[];
  readonly mappingKeys: readonly string[];
  readonly routedAccountKeys?: readonly string[];
  readonly duplicatePolicy?: ImportDuplicatePolicy;
  readonly cadence?: Partial<ImportProfileCadence>;
  readonly remindersEnabled?: boolean;
  readonly now?: Date;
}

export interface ImportRunHistoryEntry {
  readonly runId: string;
  readonly profileId: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: ImportRunStatus;
  readonly importedCount: number;
  readonly skippedDuplicateCount: number;
  readonly errorCount: number;
  readonly diagnostics: readonly string[];
}

export interface ReimportPlan {
  readonly profileId: string;
  readonly due: boolean;
  readonly requiresUserConfirmation: boolean;
  readonly status: ImportRunStatus;
  readonly newTransactionCount: number;
  readonly duplicateCount: number;
  readonly errorCount: number;
  readonly diagnostics: readonly string[];
}

export interface ImportHistorySummary {
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly failedRuns: number;
  readonly importedCount: number;
  readonly skippedDuplicateCount: number;
  readonly errorCount: number;
  readonly lastRunAt: string | null;
}

export function createSavedImportProfile(input: CreateImportProfileInput): SavedImportProfile {
  const now = (input.now ?? new Date()).toISOString();
  const cadence = normalizeCadence(input.cadence);
  const mappingFingerprint = buildStableFingerprint([...input.headers, ...input.mappingKeys]);
  const accountRoutingFingerprint = input.routedAccountKeys
    ? buildStableFingerprint(input.routedAccountKeys)
    : null;

  return {
    id: `import-profile-${buildStableFingerprint([input.name, input.sourceFormat, mappingFingerprint]).slice(0, 12)}`,
    name: input.name.trim(),
    sourceFormat: input.sourceFormat,
    mappingFingerprint,
    accountRoutingFingerprint,
    duplicatePolicy: input.duplicatePolicy ?? 'skip',
    cadence,
    remindersEnabled: input.remindersEnabled ?? cadence.kind !== 'manual',
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
  };
}

export function isImportProfileDue(profile: SavedImportProfile, now: Date): boolean {
  if (!profile.remindersEnabled || profile.cadence.kind === 'manual') return false;
  if (!profile.lastRunAt) return true;
  const nextRun = computeNextRunDate(new Date(profile.lastRunAt), profile.cadence);
  return now.getTime() >= nextRun.getTime();
}

export function planReimportRun(input: {
  readonly profile: SavedImportProfile;
  readonly parsedTransactionCount: number;
  readonly duplicateCount: number;
  readonly parserErrorCount: number;
  readonly now?: Date;
}): ReimportPlan {
  const newTransactionCount = Math.max(input.parsedTransactionCount - input.duplicateCount, 0);
  const diagnostics: string[] = [];

  if (input.duplicateCount > 0)
    diagnostics.push(`${input.duplicateCount} duplicate transaction(s) detected`);
  if (input.parserErrorCount > 0)
    diagnostics.push(`${input.parserErrorCount} parser error(s) need review`);
  if (newTransactionCount > 0)
    diagnostics.push(`${newTransactionCount} new transaction(s) require confirmation`);

  const status: ImportRunStatus =
    input.parserErrorCount > 0 ? 'failed' : newTransactionCount > 0 ? 'needs_review' : 'completed';

  return {
    profileId: input.profile.id,
    due: isImportProfileDue(input.profile, input.now ?? new Date()),
    requiresUserConfirmation: newTransactionCount > 0 || input.parserErrorCount > 0,
    status,
    newTransactionCount,
    duplicateCount: input.duplicateCount,
    errorCount: input.parserErrorCount,
    diagnostics,
  };
}

export function recordImportRun(input: {
  readonly profile: SavedImportProfile;
  readonly plan: ReimportPlan;
  readonly importedCount: number;
  readonly now?: Date;
}): { readonly profile: SavedImportProfile; readonly run: ImportRunHistoryEntry } {
  const now = (input.now ?? new Date()).toISOString();
  const run: ImportRunHistoryEntry = {
    runId: `import-run-${input.profile.id}-${now}`,
    profileId: input.profile.id,
    startedAt: now,
    completedAt: now,
    status: input.plan.status,
    importedCount: input.importedCount,
    skippedDuplicateCount: input.plan.duplicateCount,
    errorCount: input.plan.errorCount,
    diagnostics: input.plan.diagnostics,
  };

  return {
    profile: { ...input.profile, updatedAt: now, lastRunAt: now },
    run,
  };
}

export function summarizeImportHistory(
  entries: readonly ImportRunHistoryEntry[],
): ImportHistorySummary {
  return {
    totalRuns: entries.length,
    completedRuns: entries.filter((entry) => entry.status === 'completed').length,
    failedRuns: entries.filter((entry) => entry.status === 'failed').length,
    importedCount: entries.reduce((total, entry) => total + entry.importedCount, 0),
    skippedDuplicateCount: entries.reduce((total, entry) => total + entry.skippedDuplicateCount, 0),
    errorCount: entries.reduce((total, entry) => total + entry.errorCount, 0),
    lastRunAt:
      entries
        .map((entry) => entry.completedAt)
        .filter((value): value is string => !!value)
        .sort()
        .at(-1) ?? null,
  };
}

function normalizeCadence(
  cadence: Partial<ImportProfileCadence> | undefined,
): ImportProfileCadence {
  const kind = cadence?.kind ?? 'manual';
  const interval = Math.max(1, cadence?.interval ?? 1);
  return {
    kind,
    interval,
    dayOfWeek: clampOptional(cadence?.dayOfWeek, 0, 6),
    dayOfMonth: clampOptional(cadence?.dayOfMonth, 1, 31),
  };
}

function computeNextRunDate(lastRun: Date, cadence: ImportProfileCadence): Date {
  const next = new Date(lastRun.getTime());
  switch (cadence.kind) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + cadence.interval);
      return next;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + cadence.interval * 7);
      return adjustToDayOfWeek(next, cadence.dayOfWeek);
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + cadence.interval);
      if (cadence.dayOfMonth) next.setUTCDate(Math.min(cadence.dayOfMonth, daysInMonth(next)));
      return next;
    case 'manual':
      return new Date(Number.POSITIVE_INFINITY);
  }
}

function adjustToDayOfWeek(date: Date, dayOfWeek: number | undefined): Date {
  if (dayOfWeek === undefined) return date;
  const adjusted = new Date(date.getTime());
  const delta = (dayOfWeek - adjusted.getUTCDay() + 7) % 7;
  adjusted.setUTCDate(adjusted.getUTCDate() + delta);
  return adjusted;
}

function daysInMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function clampOptional(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  return Math.min(max, Math.max(min, value));
}

function buildStableFingerprint(values: readonly string[]): string {
  let hash = 2166136261;
  for (const value of values.map(normalizeFingerprintPart).sort()) {
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeFingerprintPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
