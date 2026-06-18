// SPDX-License-Identifier: BUSL-1.1

import {
  applyRepair,
  buildRepairCommitPlan,
  type DuplicateRepairAction,
  type RepairableImportRow,
  type RepairChangeSet,
  type RepairCommitPlan,
} from './import-repair';

export interface OcrRepairSuggestion extends RepairChangeSet {
  readonly confidence: number;
}

export interface RepairedImportGate {
  readonly plan: RepairCommitPlan;
  readonly canCommit: boolean;
  readonly requiresWarningConfirmation: boolean;
  readonly blockedReason: string | null;
}

export function applyOcrRepairSuggestion(
  row: RepairableImportRow,
  suggestion: OcrRepairSuggestion,
  minimumConfidence = 0.75,
): RepairableImportRow {
  if (suggestion.confidence < minimumConfidence) return row;
  return applyRepair(row, suggestion);
}

export function buildRepairedImportGate(input: {
  readonly rows: readonly RepairableImportRow[];
  readonly duplicateActions?: Readonly<Record<number, DuplicateRepairAction>>;
  readonly warningsConfirmed?: boolean;
}): RepairedImportGate {
  const plan = buildRepairCommitPlan(input.rows, input.duplicateActions);
  const requiresWarningConfirmation =
    plan.warningRows.length > 0 && input.warningsConfirmed !== true;
  const blockedReason =
    plan.blockedRows.length > 0
      ? `${plan.blockedRows.length} row(s) still have blocking errors`
      : requiresWarningConfirmation
        ? `${plan.warningRows.length} row(s) have warnings that need confirmation`
        : null;

  return {
    plan,
    canCommit: plan.canCommit && !requiresWarningConfirmation,
    requiresWarningConfirmation,
    blockedReason,
  };
}
