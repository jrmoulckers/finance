// SPDX-License-Identifier: BUSL-1.1

import {
  isImportProfileDue,
  planReimportRun,
  type ReimportPlan,
  type SavedImportProfile,
} from '../import/scheduled-reimport';
import type { AppNotification } from './types';

export interface ImportReminderOptions {
  readonly now?: Date;
  readonly includeManualProfiles?: boolean;
  readonly snoozedProfileIds?: ReadonlySet<string>;
}

export interface ManualReimportRequest {
  readonly profile: SavedImportProfile;
  readonly parsedTransactionCount: number;
  readonly duplicateCount: number;
  readonly parserErrorCount: number;
  readonly mappingFingerprint?: string;
  readonly accountRoutingFingerprint?: string | null;
  readonly existingRunKeys?: ReadonlySet<string>;
  readonly now?: Date;
}

export interface ManualReimportIntent {
  readonly profileId: string;
  readonly plan: ReimportPlan;
  readonly allowed: boolean;
  readonly duplicateProtected: boolean;
  readonly rememberedMappingMatches: boolean;
  readonly requiresUserConfirmation: boolean;
  readonly runKey: string;
  readonly blockReasons: readonly string[];
}

function reminderEligible(profile: SavedImportProfile, options: Required<Pick<ImportReminderOptions, 'includeManualProfiles'>> & ImportReminderOptions): boolean {
  if (options.snoozedProfileIds?.has(profile.id) === true) return false;
  if (profile.cadence.kind === 'manual') return options.includeManualProfiles && profile.remindersEnabled;
  return isImportProfileDue(profile, options.now ?? new Date());
}

export function buildImportProfileReminderNotifications(
  profiles: readonly SavedImportProfile[],
  options: ImportReminderOptions = {},
): AppNotification[] {
  const now = options.now ?? new Date();
  const normalizedOptions = { includeManualProfiles: false, ...options, now };

  return profiles
    .filter((profile) => reminderEligible(profile, normalizedOptions))
    .map((profile) => ({
      id: `import-profile-reminder-${profile.id}`,
      type: 'transaction_confirmation',
      severity: 'info',
      title: 'Import profile is ready to run',
      message: `${profile.name} can be re-run with its saved column mapping and duplicate policy before any new transactions are committed.`,
      createdAt: now.toISOString(),
      status: 'unread',
      entityId: profile.id,
      actionLabel: 'Review import',
      deduplicationKey: `import-profile-reminder-${profile.id}-${now.toISOString().slice(0, 10)}`,
    }));
}

export function planManualReimport(request: ManualReimportRequest): ManualReimportIntent {
  const plan = planReimportRun({
    profile: request.profile,
    parsedTransactionCount: request.parsedTransactionCount,
    duplicateCount: request.duplicateCount,
    parserErrorCount: request.parserErrorCount,
    now: request.now,
  });
  const rememberedMappingMatches = request.mappingFingerprint === undefined
    || request.mappingFingerprint === request.profile.mappingFingerprint;
  const accountRoutingMatches = request.accountRoutingFingerprint === undefined
    || request.accountRoutingFingerprint === request.profile.accountRoutingFingerprint;
  const runKey = [
    request.profile.id,
    request.mappingFingerprint ?? request.profile.mappingFingerprint,
    request.accountRoutingFingerprint ?? request.profile.accountRoutingFingerprint ?? 'none',
    request.parsedTransactionCount,
    request.duplicateCount,
    request.parserErrorCount,
    (request.now ?? new Date()).toISOString().slice(0, 10),
  ].join(':');
  const blockReasons: string[] = [];

  if (!rememberedMappingMatches) blockReasons.push('saved mapping does not match this file');
  if (!accountRoutingMatches) blockReasons.push('saved account routing does not match this file');
  if (request.existingRunKeys?.has(runKey) === true) blockReasons.push('matching re-import was already planned');

  return {
    profileId: request.profile.id,
    plan,
    allowed: blockReasons.length === 0,
    duplicateProtected: request.profile.duplicatePolicy !== 'keep_both' && request.duplicateCount > 0,
    rememberedMappingMatches: rememberedMappingMatches && accountRoutingMatches,
    requiresUserConfirmation: plan.requiresUserConfirmation,
    runKey,
    blockReasons,
  };
}

export function canCommitReimportPlan(plan: ReimportPlan, confirmed: boolean): boolean {
  if (plan.status === 'failed') return false;
  if (!plan.requiresUserConfirmation) return true;
  return confirmed;
}
